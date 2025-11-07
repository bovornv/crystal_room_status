# Firebase Firestore Setup Guide

This app uses Firebase Firestore for real-time synchronization of room data across all devices.

## Setup Steps

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Follow the setup wizard

### 2. Enable Firestore Database

1. In Firebase Console, go to **Build** > **Firestore Database**
2. Click **Create database**
3. Start in **test mode** (for development) or **production mode** (with security rules)
4. Choose a location for your database

### 3. Get Your Firebase Configuration

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Scroll down to **Your apps** section
3. Click the **Web** icon (`</>`) to add a web app
4. Register your app (you can skip hosting for now)
5. Copy the Firebase configuration object

### 4. Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and fill in your Firebase credentials:
   ```
   VITE_FIREBASE_API_KEY=your-api-key-here
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   VITE_FIREBASE_APP_ID=your-app-id
   ```

### 5. Set Up Firestore Security Rules (Important!)

In Firebase Console, go to **Firestore Database** > **Rules** and add:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write access to rooms collection
    match /rooms/{document=**} {
      allow read, write: if true; // For development - restrict in production!
    }
  }
}
```

**⚠️ Warning:** The above rules allow anyone to read/write. For production, implement proper authentication and security rules.

### 6. Test the Integration

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Open the app in your browser
3. The app will automatically:
   - Create a document at `rooms/allRooms` if it doesn't exist
   - Sync all room changes in real-time
   - Update across all open browser tabs/devices

## How It Works

- **Real-time Sync**: All room data is stored in Firestore at `rooms/allRooms`
- **Automatic Updates**: Changes made on one device instantly appear on all other devices
- **Offline Support**: Firebase caches data locally for offline access
- **Debounced Writes**: Updates are debounced by 500ms to prevent excessive writes

## Data Structure

The Firestore document structure:
```javascript
{
  rooms: [
    {
      number: "101",
      type: "D5",
      floor: 1,
      status: "vacant",
      maid: "",
      remark: "",
      cleanedToday: false,
      lastEditor: "",
      selectedBy: "",
      cleanedBy: ""
    },
    // ... more rooms
  ],
  departureRooms: ["101", "102", ...],
  inhouseRooms: ["201", "202", ...],
  lastUpdated: "2024-01-01T00:00:00.000Z"
}
```

## Troubleshooting

- **"Error initializing Firestore"**: Check your Firebase config in `.env`
- **Changes not syncing**: Check browser console for errors
- **Permission denied**: Update Firestore security rules
- **Data not loading**: Ensure Firestore is enabled in Firebase Console

