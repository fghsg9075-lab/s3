import React, { useEffect, useState } from "react";
import { db, storage, auth } from "../firebase";
import { collection, getDocs, query, where, updateDoc, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { updateProfile } from "firebase/auth";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSecurity } from "../context/SecurityContext";

const Home = () => {
  const [users, setUsers] = useState([]);
  const [uploading, setUploading] = useState(false);
  const { currentUser, logout } = useAuth();
  const { setIgnoreLock } = useSecurity();
  
  // Admin Check
  const isAdmin = currentUser?.email === "nadiman0636indo@gmail.com"; 

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const q = query(collection(db, "users"), where("uid", "!=", currentUser.uid));
        const querySnapshot = await getDocs(q);
        const userList = [];
        querySnapshot.forEach((doc) => {
          userList.push(doc.data());
        });
        setUsers(userList);
      } catch (error) {
        console.error("Error fetching users: ", error);
      }
    };

    if (currentUser) {
      fetchUsers();
    }
  }, [currentUser]);

  const handleProfilePicChange = async (e) => {
    if (e.target.files[0]) {
        setUploading(true);
        try {
            const file = e.target.files[0];
            const fileRef = ref(storage, `profile_pics/${currentUser.uid}`);
            await uploadBytes(fileRef, file);
            const photoURL = await getDownloadURL(fileRef);
            
            // Update Firestore
            await updateDoc(doc(db, "users", currentUser.uid), { photoURL });
            
            // Update Auth Profile (reflects immediately in UI without reload)
            if (auth.currentUser) {
                await updateProfile(auth.currentUser, { photoURL });
            }
            
            alert("Profile picture updated!");
        } catch (error) {
            console.error("Error upload profile pic", error);
            alert("Failed to update profile pic");
        }
        setUploading(false);
    }
  };

  const formatLastSeen = (timestamp) => {
      if (!timestamp) return "Offline";
      const date = timestamp.toDate();
      const now = new Date();
      const diff = Math.floor((now - date) / 1000); 

      if (diff < 60) return "Online";
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <header className="bg-emerald-600 px-4 py-3 text-white flex justify-between items-center shadow-sm sticky top-0 z-50">
        <h1 className="text-xl font-bold tracking-wide">SecureChat</h1>
        <div className="flex items-center gap-4">
            {isAdmin && (
                <Link to="/admin" className="text-emerald-100 hover:text-white font-medium text-sm">
                    Admin
                </Link>
            )}
            
            <div className="relative group">
                <label className="cursor-pointer">
                    <div className="w-8 h-8 rounded-full bg-emerald-700 overflow-hidden border border-emerald-500">
                        {currentUser?.photoURL ? (
                            <img src={currentUser.photoURL} alt="Me" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs font-bold">ME</div>
                        )}
                    </div>
                    <input 
                        type="file" 
                        className="hidden" 
                        onClick={() => setIgnoreLock(true)} // Prevent Lock
                        onChange={handleProfilePicChange} 
                        accept="image/*" 
                    />
                </label>
                {uploading && <span className="absolute -bottom-4 right-0 text-[10px]">...</span>}
            </div>

            <button onClick={logout} className="text-white hover:text-red-200" title="Logout">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                </svg>
            </button>
        </div>
      </header>

      {/* User List */}
      <main className="max-w-screen-md mx-auto">
        <div className="bg-white shadow-sm sm:rounded-lg overflow-hidden divide-y divide-gray-100">
          {users.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
                <p className="mb-2">No contacts found.</p>
                <p className="text-sm">Invite friends to start chatting!</p>
            </div>
          ) : (
            <ul>
              {users.map((user) => (
                <li key={user.uid} className="hover:bg-gray-50 transition-colors">
                  <Link to={`/chat/${user.uid}`} className="flex items-center px-4 py-3 gap-4">
                    
                    {/* Avatar */}
                    <div className="relative">
                        <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold overflow-hidden border border-gray-100">
                        {user.photoURL ? (
                            <img src={user.photoURL} alt="DP" className="h-full w-full object-cover" />
                        ) : (
                            <span>{user.displayName?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}</span>
                        )}
                        </div>
                        {/* Status Dot (Mocked based on recent activity/logic if available, else static) */}
                        {user.status === "online" && (
                             <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
                        )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                          <h2 className="text-base font-medium text-gray-900 truncate">
                              {user.displayName || user.email.split('@')[0]}
                          </h2>
                          <span className="text-xs text-gray-400">
                              {formatLastSeen(user.lastSeen)}
                          </span>
                      </div>
                      <p className="text-sm text-gray-500 truncate">
                         {/* We could fetch last message preview here but for now static text */}
                         Tap to start chatting
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
};

export default Home;
