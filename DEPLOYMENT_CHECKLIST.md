# Deployment Checklist

## ✅ Completed Steps
- [x] Code pushed to GitHub
- [x] Vercel project created
- [x] Domains configured and validated
- [x] DNS records updated

## 🔍 Next Steps to Verify

### 1. Check Environment Variables
Go to Vercel Dashboard → Your Project → Settings → Environment Variables

Make sure all 6 Firebase variables are set:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

**Important:** If you just added them, you may need to redeploy:
- Go to Deployments tab
- Click the three dots (⋯) on the latest deployment
- Click "Redeploy"

### 2. Test the App
Visit https://crystalresort.app/ and test:
- [ ] App loads without errors
- [ ] Login modal appears
- [ ] Can login with nickname
- [ ] Can click on room cards
- [ ] Can change room status
- [ ] Can upload PDF reports
- [ ] Real-time sync works (open in 2 browser tabs)

### 3. Check Browser Console
1. Open https://crystalresort.app/
2. Press F12 (or Right-click → Inspect → Console)
3. Look for any errors (especially Firebase errors)
4. If you see Firebase errors, check environment variables

### 4. Verify Firebase Firestore
1. Go to Firebase Console
2. Check Firestore Database → Data
3. You should see a document at `rooms/allRooms`
4. Verify security rules allow read/write

### 5. Test Real-time Sync
1. Open https://crystalresort.app/ in two browser tabs
2. Login in both tabs
3. Make a change in one tab (change room status)
4. The change should appear in the other tab automatically

## 🐛 Troubleshooting

### App shows blank page
- Check browser console for errors
- Verify all environment variables are set
- Check Vercel deployment logs

### Firebase errors in console
- Verify environment variables match your Firebase project
- Check Firestore security rules
- Ensure Firestore is enabled in Firebase Console

### Changes not syncing
- Check Firestore security rules allow read/write
- Verify Firebase project ID is correct
- Check browser console for errors

### PDF upload not working
- Check browser console for errors
- Verify PDF.js worker file is accessible
- Check network tab for failed requests

