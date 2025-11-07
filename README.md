# Crystal Resort Room Status Dashboard

A real-time room status tracking system for Crystal Resort, built with React and Firebase Firestore.

## Features

- 📊 **Interactive 6-floor room diagram** showing real-time room status
- 📄 **PDF Report Upload** - Automatically update room statuses from Expected Departure and In-House reports
- 👥 **Multi-user Support** - Real-time synchronization across all devices
- 🔐 **Login System** - Secure nickname-based authentication
- 📝 **Room Management** - Edit room status, add remarks, assign maids
- 📈 **Maid Summary** - Track daily room cleaning scores
- 🎨 **Beautiful UI** - Calm white/green theme with Noto Sans Thai font

## Tech Stack

- **React** - UI framework
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Firebase Firestore** - Real-time database
- **PDF.js** - PDF parsing

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/bovornv/crystal_room_status.git
   cd crystal_room_status
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up Firebase:
   - Create a Firebase project at https://console.firebase.google.com/
   - Enable Firestore Database
   - Copy `.env.example` to `.env` and add your Firebase credentials
   - See `FIREBASE_SETUP_STEP_BY_STEP.md` for detailed instructions

4. Run development server:
   ```bash
   npm run dev
   ```

5. Build for production:
   ```bash
   npm run build
   ```

## Environment Variables

Create a `.env` file with your Firebase configuration:

```
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

## Deployment

This app is deployed on Vercel at https://crystalresort.app/

To deploy:
1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy!

## License

© 2025 Crystal Resort. All rights reserved.

