import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { useAuth } from "./AuthContext";

const SecurityContext = createContext();

export const useSecurity = () => useContext(SecurityContext);

export const SecurityProvider = ({ children }) => {
  const { currentUser } = useAuth();
  // Initialize from sessionStorage to prevent lock on refresh
  const [isLocked, setIsLocked] = useState(() => {
      return sessionStorage.getItem("isUnlocked") !== "true";
  });
  
  // Ref to track if we should ignore the next lock event (e.g. file picker opening)
  const ignoreLockRef = useRef(false);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // App went to background or tab switched
        // Only lock if we are NOT ignoring it (e.g. for file picker)
        if (!ignoreLockRef.current) {
            setIsLocked(true);
            sessionStorage.removeItem("isUnlocked");
        }
      } else {
        // App became visible again
        // Reset the ignore flag so subsequent backgrounding DOES lock
        // We use a small timeout to ensure the 'visible' event processes after any potential immediate 'hidden' from file picker return
        setTimeout(() => {
            ignoreLockRef.current = false;
        }, 500);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
     // If user logs out, reset lock logic
     if (!currentUser) {
         setIsLocked(false); 
         sessionStorage.removeItem("isUnlocked");
     }
  }, [currentUser]);

  const unlock = () => {
     setIsLocked(false);
     sessionStorage.setItem("isUnlocked", "true");
  };
  
  const setLocked = (locked) => {
      setIsLocked(locked);
      if (locked) {
          sessionStorage.removeItem("isUnlocked");
      } else {
          sessionStorage.setItem("isUnlocked", "true");
      }
  }

  const setIgnoreLock = (ignore) => {
      ignoreLockRef.current = ignore;
  };

  const value = {
    isLocked,
    setLocked,
    unlock,
    setIgnoreLock
  };

  return (
    <SecurityContext.Provider value={value}>
      {children}
    </SecurityContext.Provider>
  );
};
