# Firebase Security Rules

## Firestore Database Rules

Copy and paste these rules into your Firebase Console -> Firestore Database -> Rules tab.

```match
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }

    // Check if user is the specific admin
    function isAdmin() {
      return isAuthenticated() && request.auth.token.email == "nadiman0636indo@gmail.com";
    }

    // Users Collection
    // Users can read/write their own profile. Authenticated users can read other users (to find friends).
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated() && request.auth.uid == userId;
    }

    // Chats Collection
    // Chat documents store metadata like wallpaperUrl.
    // Allow read/write if the user's ID is part of the chat ID (e.g. "uid1-uid2") or if admin.
    match /chats/{chatId} {
      allow read, write: if isAuthenticated() && (chatId.matches('.*' + request.auth.uid + '.*') || isAdmin());
      
      // Messages Subcollection
      match /messages/{messageId} {
        allow read, write: if isAuthenticated() && chatId.matches('.*' + request.auth.uid + '.*');
      }
      
      // Signaling Subcollection (for Video Calls)
      match /call/{document=**} {
        allow read, write: if isAuthenticated() && chatId.matches('.*' + request.auth.uid + '.*');
      }
    }
  }
}
```

## Storage Rules

Copy and paste these rules into your Firebase Console -> Storage -> Rules tab.

```match
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    
    function isAuthenticated() {
      return request.auth != null;
    }

    // Profile Pictures
    match /profile_pics/{userId} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated() && request.auth.uid == userId;
    }

    // Chat Media
    match /chat/{chatId}/{fileName} {
      allow read, write: if isAuthenticated() && chatId.matches('.*' + request.auth.uid + '.*');
    }
  }
}
```

## Realtime Database Rules (Optional)

If you use Realtime Database features (currently not heavily used in this app structure, mostly Firestore), use these default secure rules.

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```
