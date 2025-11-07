# Firebase Setup - Step by Step Guide

## Step 1: Create a Firebase Project

1. Go to https://console.firebase.google.com/
2. Click **"Add project"** (or **"Create a project"** if this is your first time)
3. Enter a project name (e.g., "Crystal Resort")
4. Click **"Continue"**
5. **Optional**: Disable Google Analytics (you can skip this for now)
6. Click **"Create project"**
7. Wait for the project to be created (takes about 30 seconds)
8. Click **"Continue"** when it's ready

## Step 2: Enable Firestore Database

1. In the Firebase Console, look at the left sidebar
2. Click on **"Build"** (or the icon that looks like a building)
3. Click on **"Firestore Database"**
4. Click the **"Create database"** button
5. Choose **"Start in test mode"** (for development - we'll secure it later)
6. Click **"Next"**
7. Choose a location (select the closest one to your users, e.g., "asia-southeast1" for Thailand)
8. Click **"Enable"**
9. Wait for Firestore to initialize (takes about 1 minute)

## Step 3: Get Your Firebase Configuration

1. In Firebase Console, click the **gear icon** (⚙️) next to "Project Overview" at the top left
2. Click **"Project settings"**
3. Scroll down to the **"Your apps"** section
4. You'll see icons for different platforms (iOS, Android, Web)
5. Click the **Web icon** (`</>`)
6. Register your app:
   - **App nickname**: Enter "Crystal Resort Web" (or any name)
   - **Firebase Hosting**: You can skip this (uncheck the box)
7. Click **"Register app"**
8. You'll see a code block with your Firebase configuration that looks like this:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project-id",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };
   ```
9. **Copy these values** - you'll need them in the next step

## Step 4: Create .env File

1. Open your project folder in a code editor (VS Code, etc.)
2. Look for a file named `.env.example` in the root folder
3. **Copy** `.env.example` and rename it to `.env` (just remove `.example`)
4. Open the `.env` file
5. Replace the placeholder values with your actual Firebase config:

   ```
   VITE_FIREBASE_API_KEY=AIzaSy... (paste your apiKey here)
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com (paste your authDomain here)
   VITE_FIREBASE_PROJECT_ID=your-project-id (paste your projectId here)
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com (paste your storageBucket here)
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789 (paste your messagingSenderId here)
   VITE_FIREBASE_APP_ID=1:123456789:web:abc123 (paste your appId here)
   ```

6. **Important**: 
   - Don't use quotes around the values
   - Don't leave any spaces around the `=` sign
   - Make sure there are no extra spaces

## Step 5: Set Firestore Security Rules

1. In Firebase Console, go to **"Build"** > **"Firestore Database"**
2. Click on the **"Rules"** tab (at the top)
3. You'll see a code editor with some default rules
4. **Replace** all the existing code with this:

   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /rooms/{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```

5. Click **"Publish"** button
6. You'll see a confirmation - click **"Publish"** again

⚠️ **Note**: These rules allow anyone to read/write. This is fine for development, but you should add authentication later for production.

## Step 6: Test the Integration

1. Open a terminal in your project folder
2. Make sure your `.env` file is saved
3. Restart your development server:
   ```bash
   # Stop the current server (Ctrl+C if running)
   npm run dev
   ```
4. Open your app in the browser
5. Open the browser's Developer Console (F12 or Right-click > Inspect > Console tab)
6. You should see:
   - No Firebase errors
   - The app loads normally
7. Make a change to a room (change status, add remark, etc.)
8. Open the same app in another browser tab or device
9. The changes should appear automatically in the other tab! 🎉

## Troubleshooting

### "Error initializing Firestore"
- Check that your `.env` file exists and has all 6 values filled in
- Make sure there are no quotes around the values
- Restart your dev server after creating `.env`

### "Permission denied"
- Go back to Step 5 and make sure you published the security rules
- Check that the rules match exactly (including the `rules_version = '2';` line)

### "Cannot find module 'firebase'"
- Run: `npm install` in your project folder

### Changes not syncing
- Check the browser console for errors
- Make sure Firestore is enabled (Step 2)
- Verify your `.env` file has the correct project ID

## Next Steps (Optional - For Production)

Once everything works, you should secure your Firestore:

1. Go to **Firestore Database** > **Rules**
2. Replace with production rules that require authentication
3. Set up Firebase Authentication
4. Update the rules to check for authenticated users

For now, the test mode rules are fine for development and testing!

