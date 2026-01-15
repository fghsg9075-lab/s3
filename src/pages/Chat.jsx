import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db, storage } from "../firebase";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
  updateDoc,
  doc,
  where,
  deleteDoc,
  getDocs,
  setDoc,
  getDoc,
  arrayUnion
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, uploadString } from "firebase/storage";
import { useAuth } from "../context/AuthContext";
import { useSecurity } from "../context/SecurityContext"; // Import security hook
import { v4 as uuidv4 } from "uuid";
import VideoCall from "../components/VideoCall";

const Chat = () => {
  const { userId } = useParams();
  const { currentUser } = useAuth();
  const { setIgnoreLock } = useSecurity(); // Get ignore lock function
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [wallpaperUrl, setWallpaperUrl] = useState("");
  const [friend, setFriend] = useState(null);
  const [isInCall, setIsInCall] = useState(false);
  const [isCaller, setIsCaller] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  
  // Settings
  const [disappearingMode, setDisappearingMode] = useState("24h"); 
  const [showSettings, setShowSettings] = useState(false);
  const [updatingWallpaper, setUpdatingWallpaper] = useState(false); // Wallpaper loading state

  const navigate = useNavigate();
  const bottomRef = useRef(null);
  
  const isAdmin = currentUser?.email === "nadiman0636indo@gmail.com"; 

  const chatId = currentUser.uid > userId 
    ? `${currentUser.uid}-${userId}` 
    : `${userId}-${currentUser.uid}`;

  useEffect(() => {
    const unsubscribeFriend = onSnapshot(doc(db, "users", userId), (doc) => {
        if (doc.exists()) { setFriend(doc.data()); }
    });

    const unsubscribeChat = onSnapshot(doc(db, "chats", chatId), (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            if (data.wallpaperUrl) setWallpaperUrl(data.wallpaperUrl);
            if (data.disappearingMode) setDisappearingMode(data.disappearingMode);
        }
    });

    const unsubscribeCall = onSnapshot(doc(db, "chats", chatId, "call", "signaling"), (snapshot) => {
        const data = snapshot.data();
        if (data?.offer && !isInCall && !isCaller) {
             const accept = window.confirm("Incoming Video Call from " + (friend?.displayName || "Friend") + ". Accept?");
             if (accept) {
                 setIsCaller(false);
                 setIsInCall(true);
             } else {
                 deleteDoc(doc(db, "chats", chatId, "call", "signaling"));
             }
        } else if (!data && isInCall) {
            setIsInCall(false);
            setIsCaller(false);
        }
    });

    const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"));
    const unsubscribeMsgs = onSnapshot(q, (snapshot) => {
      const msgs = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        
        // True 24 Hour Deletion Logic
        if (disappearingMode === "24h" && data.createdAt) {
             const now = new Date();
             const msgTime = data.createdAt.toDate();
             const diffHours = (now - msgTime) / (1000 * 60 * 60);
             if (diffHours >= 24) {
                 // If older than 24h, delete it
                 deleteDoc(doc.ref).catch(console.error);
                 return; 
             }
        }

        if (!data.hiddenFor || !data.hiddenFor.includes(currentUser.uid)) {
            msgs.push({ id: doc.id, ...data });
        }
      });
      setMessages(msgs);
      msgs.forEach(async (msg) => {
          if (msg.senderId !== currentUser.uid && !msg.seen) {
             try {
                const msgRef = doc(db, "chats", chatId, "messages", msg.id);
                await updateDoc(msgRef, { seen: true });
             } catch (e) { console.error(e); }
          }
      });
    });

    return () => {
        unsubscribeFriend();
        unsubscribeChat();
        unsubscribeMsgs();
        unsubscribeCall();
    };
  }, [chatId, currentUser.uid, userId, isInCall, isCaller, friend, disappearingMode]);

  useEffect(() => {
     return () => {
         // Logic: ONLY run if mode is "instant"
         if (disappearingMode !== "instant") return;

         const hideSeenMessages = async () => {
             try {
                const qSeen = query(
                    collection(db, "chats", chatId, "messages"),
                    where("senderId", "==", userId), 
                    where("seen", "==", true)
                );
                const snapshot = await getDocs(qSeen);
                const updatePromises = [];
                snapshot.forEach((d) => {
                    const data = d.data();
                    if (!data.saved) {
                        updatePromises.push(updateDoc(d.ref, {
                            hiddenFor: arrayUnion(currentUser.uid)
                        }));
                    }
                });
                await Promise.all(updatePromises);
             } catch (error) { console.error(error); }
         };
         hideSeenMessages();
     }
  }, [chatId, userId, currentUser.uid, disappearingMode]); 
  
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, replyTo]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text && !file) return;

    setLoading(true);
    setUploadProgress(0);

    try {
      let url = null;
      let type = "text";
      let fileName = "";

      if (file) {
        const fileRef = ref(storage, `chat/${chatId}/${uuidv4()}`);
        const uploadTask = uploadBytesResumable(fileRef, file);
        fileName = file.name;

        uploadTask.on('state_changed', 
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(progress);
          }, 
          (error) => {
             console.error("Upload failed", error);
             setLoading(false);
          }, 
          async () => {
            url = await getDownloadURL(uploadTask.snapshot.ref);
            if (file.type.startsWith("image/")) { type = "image"; }
            else if (file.type.startsWith("video/")) { type = "video"; }
            else { type = "file"; }
            
            await sendMessage(text, url, type, fileName);
            setLoading(false);
            setUploadProgress(0);
            setText("");
            setFile(null);
            setReplyTo(null);
          }
        );
        return; 
      } else {
          await sendMessage(text, null, "text", "");
          setText("");
          setLoading(false);
          setReplyTo(null);
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const sendMessage = async (msgText, mediaUrl, msgType, fileName) => {
      await addDoc(collection(db, "chats", chatId, "messages"), {
        text: msgText,
        senderId: currentUser.uid,
        createdAt: Timestamp.now(),
        seen: false,
        saved: false,
        hiddenFor: [],
        ...(mediaUrl && { url: mediaUrl, type: msgType, fileName }),
        ...(replyTo && { 
            replyTo: {
                id: replyTo.id,
                text: replyTo.text,
                senderId: replyTo.senderId,
                type: replyTo.type,
                url: replyTo.url || null
            } 
        })
      });
  };
  
  const handleFileChange = (e) => {
      if (e.target.files[0]) {
          setFile(e.target.files[0]);
      }
  }

  const handleWallpaperChange = async (e) => {
      const wallpaperFile = e.target.files[0];
      if (!wallpaperFile) return;
      
      setUpdatingWallpaper(true); // Show indicator
      
      try {
          const fileRef = ref(storage, `chat/${chatId}/wallpaper_${uuidv4()}`);
          await uploadBytesResumable(fileRef, wallpaperFile);
          const url = await getDownloadURL(fileRef);
          await setDoc(doc(db, "chats", chatId), { wallpaperUrl: url }, { merge: true });
          alert("Wallpaper updated!");
      } catch (err) { console.error(err); alert("Failed to update wallpaper"); }
      setUpdatingWallpaper(false);
  };

  const updateDisappearingMode = async (mode) => {
      try {
          await setDoc(doc(db, "chats", chatId), { disappearingMode: mode }, { merge: true });
          setDisappearingMode(mode);
          setShowSettings(false);
      } catch (err) { console.error(err); }
  }

  const toggleSave = async (msgId, currentStatus) => {
      const msgRef = doc(db, "chats", chatId, "messages", msgId);
      await updateDoc(msgRef, { saved: !currentStatus });
  };

  const deleteMessage = async (msgId, isSaved) => {
      if (isSaved) {
          alert("Cannot delete a saved message. Unsave it first.");
          return;
      }
      const msgRef = doc(db, "chats", chatId, "messages", msgId);
      await deleteDoc(msgRef);
  };
  
  const restoreChats = async () => {
      try {
          const q = query(collection(db, "chats", chatId, "messages"));
          const snapshot = await getDocs(q);
          const updatePromises = [];
          snapshot.forEach((d) => {
              const data = d.data();
              if (data.hiddenFor && data.hiddenFor.length > 0) {
                  updatePromises.push(updateDoc(d.ref, { hiddenFor: [] }));
              }
          });
          await Promise.all(updatePromises);
          alert("Chats restored!");
      } catch (err) { console.error(err); }
  };

  const convertToPic = async (msg) => {
      if (!msg.url) return;
      try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          canvas.width = 300;
          canvas.height = 200;
          if (msg.type === "video") {
               const video = document.createElement("video");
               video.crossOrigin = "anonymous";
               video.src = msg.url;
               video.muted = true;
               await new Promise((resolve, reject) => {
                   video.onloadeddata = () => { video.currentTime = 1; };
                   video.onseeked = () => resolve();
                   video.onerror = (e) => reject(e);
               });
               ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          } else {
              ctx.fillStyle = "#f3f4f6";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.fillStyle = "#1f2937";
              ctx.font = "20px Arial";
              ctx.fillText("Converted File:", 20, 50);
              ctx.font = "16px Arial";
              ctx.fillText(msg.fileName || "File", 20, 80);
          }
          const dataUrl = canvas.toDataURL("image/png");
          const fileRef = ref(storage, `chat/${chatId}/converted_${uuidv4()}.png`);
          await uploadString(fileRef, dataUrl, 'data_url');
          const newUrl = await getDownloadURL(fileRef);
          const msgRef = doc(db, "chats", chatId, "messages", msg.id);
          await updateDoc(msgRef, { url: newUrl, type: "image", originalType: msg.type });
      } catch (e) {
          console.error("Conversion failed", e);
          alert("Conversion failed.");
      }
  };

  const startVideoCall = () => { setIsCaller(true); setIsInCall(true); };
  const endVideoCall = () => { setIsInCall(false); setIsCaller(false); };
  const handleSwipe = (msg) => { setReplyTo(msg); };

  const formatLastSeen = (timestamp) => {
      if (!timestamp) return "Offline";
      const date = timestamp.toDate();
      const now = new Date();
      const diff = Math.floor((now - date) / 1000); 
      if (diff < 60) return "Online";
      if (diff < 3600) return `Last seen ${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `Last seen ${Math.floor(diff / 3600)}h ago`;
      return `Last seen ${date.toLocaleDateString()}`;
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 relative">
      {wallpaperUrl && (
          <div className="absolute inset-0 z-0 opacity-40 bg-cover bg-center pointer-events-none" style={{ backgroundImage: `url(${wallpaperUrl})` }} />
      )}

      {isInCall && (
          <VideoCall chatId={chatId} currentUser={currentUser} isCaller={isCaller} endCall={endVideoCall} />
      )}

      <header className="bg-emerald-600 p-3 text-white flex items-center justify-between shadow-md z-10 relative">
        <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="font-bold text-xl px-2">&larr;</button>
            {friend && (
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gray-300 overflow-hidden border-2 border-white">
                        {friend.photoURL ? (
                            <img src={friend.photoURL} alt="DP" className="h-full w-full object-cover" />
                        ) : (
                            <div className="h-full w-full flex items-center justify-center text-gray-600 font-bold text-xs">
                                {friend.displayName?.charAt(0) || friend.email?.charAt(0)}
                            </div>
                        )}
                    </div>
                    <div>
                        <h1 className="text-base font-bold leading-tight">{friend.displayName || friend.email}</h1>
                        <p className="text-xs text-emerald-100">{formatLastSeen(friend.lastSeen)}</p>
                    </div>
                </div>
            )}
        </div>
        
        <div className="flex items-center gap-4 relative">
             <button onClick={startVideoCall} className="hover:text-emerald-200" title="Video Call">
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M4.5 4.5a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h8.25a3 3 0 0 0 3-3v-9a3 3 0 0 0-3-3H4.5ZM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06Z" /></svg>
             </button>
             
             <div className="relative">
                 <button onClick={() => setShowSettings(!showSettings)} className="hover:text-emerald-200" title="Settings">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                        <path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567l-.091.549a.798.798 0 0 1-.517.608 7.45 7.45 0 0 0-.478.198.798.798 0 0 1-.796-.064l-.453-.324a1.875 1.875 0 0 0-2.416.2l-.043.044a1.875 1.875 0 0 0-.205 2.42l.33.452c.196.27.202.63.023.91a7.424 7.424 0 0 0-.27.564.798.798 0 0 1-.699.508l-.547.052A1.875 1.875 0 0 0 2.25 11.08v1.84c0 .917.663 1.699 1.567 1.85l.549.091c.28.047.518.25.608.517.06.162.127.321.198.478a.798.798 0 0 1-.064.796l-.324.453a1.875 1.875 0 0 0 .2 2.416l.044.043a1.875 1.875 0 0 0 2.42.205l.452-.33c.27-.196.63-.202.91-.023.184.108.373.2.564.27a.798.798 0 0 1 .508.699l.052.547A1.875 1.875 0 0 0 11.08 21.75h1.84c.917 0 1.699-.663 1.85-1.567l.091-.549a.798.798 0 0 1 .517-.608c.162-.06.321-.127.478-.198a.798.798 0 0 1 .796.064l.453.324a1.875 1.875 0 0 0 2.416-.2l.043-.044a1.875 1.875 0 0 0-.205 2.42l.33.452c-.196.27-.202.63-.023.91a7.424 7.424 0 0 0 .27-.564.798.798 0 0 1 .699-.508l.547-.052A1.875 1.875 0 0 0 12.92 2.25h-1.84Z" clipRule="evenodd" />
                    </svg>
                 </button>
                 {showSettings && (
                     <>
                         {/* Transparent Overlay to close menu on click outside */}
                         <div 
                             className="fixed inset-0 z-40" 
                             onClick={() => setShowSettings(false)}
                         ></div>
                         
                         {/* Settings Menu */}
                         <div className="absolute right-0 top-8 bg-white text-gray-800 rounded shadow-lg p-3 w-48 z-50 text-xs">
                             <div className="flex justify-between items-center mb-2 border-b pb-1">
                                 <p className="font-bold">Settings</p>
                                 <button 
                                     onClick={() => setShowSettings(false)} 
                                     className="text-gray-500 hover:text-red-500 font-bold px-1"
                                 >
                                     ✕
                                 </button>
                             </div>
                             
                             <p className="font-semibold text-gray-500 mb-1">Disappearing Msg:</p>
                             <button onClick={() => updateDisappearingMode('instant')} className={`block w-full text-left py-1 ${disappearingMode === 'instant' ? 'text-emerald-600 font-bold' : ''}`}>Instant (On Back)</button>
                             <button onClick={() => updateDisappearingMode('24h')} className={`block w-full text-left py-1 ${disappearingMode === '24h' ? 'text-emerald-600 font-bold' : ''}`}>24 Hours (Default)</button>
                             <button onClick={() => updateDisappearingMode('off')} className={`block w-full text-left py-1 ${disappearingMode === 'off' ? 'text-emerald-600 font-bold' : ''}`}>Off (Never)</button>
                             <div className="border-t my-2"></div>
                             <button onClick={restoreChats} className="block w-full text-left py-1 text-green-600 font-bold">Restore Chats</button>
                             <label className="block w-full text-left py-1 cursor-pointer">
                                 {updatingWallpaper ? "Setting Wallpaper..." : "Set Wallpaper"}
                                 <input 
                                     type="file" 
                                     className="hidden" 
                                     onClick={(e) => {
                                         setIgnoreLock(true); // Prevent locking
                                         e.target.value = null; // Clear to allow re-selection
                                     }}
                                     onChange={handleWallpaperChange} 
                                     accept="image/*" 
                                 />
                             </label>
                             
                             {/* Admin Wallpaper Link Input */}
                             {isAdmin && (
                                 <div className="mt-2 pt-2 border-t">
                                     <p className="font-bold text-xs mb-1">Admin Wallpaper Link:</p>
                                     <form onSubmit={(e) => {
                                         e.preventDefault();
                                         const link = e.target.link.value;
                                         if(link) {
                                             setDoc(doc(db, "chats", chatId), { wallpaperUrl: link }, { merge: true });
                                             alert("Wallpaper Link Set!");
                                             e.target.reset();
                                         }
                                     }}>
                                         <input name="link" type="text" placeholder="Paste image link..." className="w-full border rounded px-1 py-0.5 text-xs mb-1" />
                                         <button type="submit" className="w-full bg-blue-500 text-white rounded py-0.5 text-xs">Set from Link</button>
                                     </form>
                                 </div>
                             )}
                         </div>
                     </>
                 )}
             </div>

             {friend?.location && (
                 <a href={`https://www.google.com/maps?q=${friend.location.lat},${friend.location.lng}`} target="_blank" rel="noreferrer" className="hover:text-emerald-200" title="View Location">
                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>
                 </a>
             )}
             
             {/* Header Wallpaper Button - Shortcut */}
             <label className="cursor-pointer hover:text-emerald-200" title="Wallpaper">
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 0 1 2.25-2.25h16.5A2.25 2.25 0 0 1 22.5 6v12a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18V6ZM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0 0 21 18v-1.94l-2.69-2.689a1.5 1.5 0 0 0-2.12 0l-.88.879.97.97a.75.75 0 1 1-1.06 1.06l-5.16-5.159a1.5 1.5 0 0 0-2.12 0L3 16.061Zm10.125-7.81a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Z" clipRule="evenodd" /></svg>
                 <input 
                     type="file" 
                     className="hidden" 
                     onClick={(e) => {
                         setIgnoreLock(true);
                         e.target.value = null;
                     }} 
                     onChange={handleWallpaperChange} 
                     accept="image/*" 
                 />
             </label>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 z-10 relative">
        {messages.map((msg) => {
            const isMe = msg.senderId === currentUser.uid;
            return (
                <div 
                    key={msg.id} 
                    className={`flex ${isMe ? "justify-end" : "justify-start"} group relative`}
                    onDoubleClick={() => handleSwipe(msg)}
                >
                    <div className={`max-w-[75%] md:max-w-md p-2 rounded-lg relative shadow-sm ${isMe ? "bg-emerald-100 text-gray-900 rounded-tr-none" : "bg-white text-gray-900 rounded-tl-none"}`}>
                        
                        {msg.replyTo && (
                            <div className="bg-black bg-opacity-5 p-2 rounded mb-1 text-xs border-l-4 border-emerald-500">
                                <p className="font-bold text-emerald-700">{msg.replyTo.senderId === currentUser.uid ? "You" : "Friend"}</p>
                                <p className="truncate">{msg.replyTo.text || "Media"}</p>
                            </div>
                        )}

                        {msg.type === "image" && (<img src={msg.url} alt="Shared" className="rounded mb-2 max-h-64 object-cover w-full" />)}
                        {msg.type === "video" && (<video src={msg.url} controls className="rounded mb-2 max-h-64 w-full" />)}
                        {msg.type === "file" && (
                             <div className="flex items-center gap-2 p-2 bg-gray-50 rounded border text-sm">
                                 <span className="text-xl">📄</span>
                                 <a href={msg.url} target="_blank" rel="noreferrer" className="underline truncate">{msg.fileName || "Download File"}</a>
                             </div>
                        )}
                        
                        {msg.text && <p className="text-sm leading-relaxed">{msg.text}</p>}
                        
                        <div className="flex items-center justify-end mt-1 gap-1 select-none">
                             <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 mr-2">
                                <button onClick={() => handleSwipe(msg)} className="text-gray-400 hover:text-blue-500" title="Reply">↩</button>
                                <button onClick={() => toggleSave(msg.id, msg.saved)} className={`${msg.saved ? "text-yellow-500" : "text-gray-300 hover:text-yellow-500"}`} title="Save">★</button>
                                {isMe && (<button onClick={() => deleteMessage(msg.id, msg.saved)} className="text-gray-300 hover:text-red-500" title="Delete">🗑</button>)}
                                {isAdmin && (msg.type === "video" || msg.type === "file") && (<button onClick={() => convertToPic(msg)} className="text-purple-400 hover:text-purple-600" title="Convert">⚡</button>)}
                             </div>
                             <span className="text-[10px] text-gray-500">{msg.createdAt?.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            {isMe && (<span className={`text-[10px] ${msg.seen ? "text-blue-500" : "text-gray-400"}`}>{msg.seen ? "✓✓" : "✓"}</span>)}
                        </div>
                    </div>
                </div>
            );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="bg-gray-100 p-2 z-20">
          {replyTo && (
              <div className="bg-white p-2 rounded-t-lg border-l-4 border-emerald-500 flex justify-between items-center shadow-sm">
                  <div className="text-sm">
                      <p className="font-bold text-emerald-700">{replyTo.senderId === currentUser.uid ? "You" : "Friend"}</p>
                      <p className="text-gray-600 truncate max-w-xs">{replyTo.text || "Media"}</p>
                  </div>
                  <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
          )}
          
          <form onSubmit={handleSend} className="bg-white p-2 rounded-full flex items-center gap-2 shadow-md">
            <label className="cursor-pointer text-gray-500 hover:text-emerald-600 pl-2">
                <input 
                    type="file" 
                    className="hidden" 
                    onClick={() => setIgnoreLock(true)} // Prevent lock
                    onChange={handleFileChange} 
                    accept="*/*" 
                />
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path fillRule="evenodd" d="M18.97 3.659a2.25 2.25 0 0 0-3.182 0l-10.94 10.94a3.75 3.75 0 1 0 5.304 5.303l7.693-7.693a.75.75 0 0 1 1.06 1.06l-7.693 7.693a5.25 5.25 0 1 1-7.424-7.424l10.939-10.94a3.75 3.75 0 1 1 5.303 5.304L9.097 18.835l-.008.008-.007.007-.002.002-.003.002A2.25 2.25 0 0 1 5.91 15.66l7.81-7.81a.75.75 0 0 1 1.061 1.06l-7.81 7.81a.75.75 0 0 0 1.054 1.068L18.97 6.84a2.25 2.25 0 0 0 0-3.182Z" clipRule="evenodd" /></svg>
            </label>
            {file && (<div className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded flex items-center">{file.name.substring(0, 10)}...<button type="button" onClick={() => setFile(null)} className="ml-1 font-bold">✕</button></div>)}
            <input type="text" value={text} onChange={e => setText(e.target.value)} placeholder="Type a message..." className="flex-1 px-2 py-1 focus:outline-none bg-transparent"/>
            <button type="submit" disabled={loading} className="bg-emerald-600 text-white p-2 rounded-full hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center w-10 h-10">
                {loading && uploadProgress > 0 ? (<span className="text-[10px] font-bold">{Math.round(uploadProgress)}%</span>) : (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 pl-0.5"><path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" /></svg>)}
            </button>
          </form>
      </div>
    </div>
  );
};

export default Chat;
