# Vercel Deployment Guide

## Step 1: Delete Existing Deployment (if needed)

1. Go to https://vercel.com/dashboard
2. Find the project for `crystalresort.app`
3. Go to **Settings** → **General**
4. Scroll down and click **Delete Project**
5. Confirm deletion

## Step 2: Deploy New App

### Option A: Deploy via Vercel Dashboard (Recommended)

1. Go to https://vercel.com/new
2. Click **Import Git Repository**
3. Select **GitHub** and authorize if needed
4. Find and select `bovornv/crystal_room_status`
5. Click **Import**

6. **Configure Project:**
   - **Project Name**: `crystal-resort-room-status` (or any name)
   - **Framework Preset**: Vite (should auto-detect)
   - **Root Directory**: `./` (leave as is)
   - **Build Command**: `npm run build` (should auto-fill)
   - **Output Directory**: `dist` (should auto-fill)
   - **Install Command**: `npm install` (should auto-fill)

7. **Add Environment Variables:**
   Click **Environment Variables** and add all 6 Firebase variables:
   - `VITE_FIREBASE_API_KEY` = (your Firebase API key)
   - `VITE_FIREBASE_AUTH_DOMAIN` = (your Firebase auth domain)
   - `VITE_FIREBASE_PROJECT_ID` = (your Firebase project ID)
   - `VITE_FIREBASE_STORAGE_BUCKET` = (your Firebase storage bucket)
   - `VITE_FIREBASE_MESSAGING_SENDER_ID` = (your Firebase messaging sender ID)
   - `VITE_FIREBASE_APP_ID` = (your Firebase app ID)

8. **Configure Domain:**
   - Go to **Settings** → **Domains**
   - Click **Add Domain**
   - Enter `crystalresort.app`
   - Follow the DNS configuration instructions if needed

9. Click **Deploy**

### Option B: Deploy via Vercel CLI

1. Install Vercel CLI (if not installed):
   ```bash
   npm i -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy:
   ```bash
   vercel
   ```

4. Follow the prompts:
   - Link to existing project? **No** (for new deployment)
   - Project name: `crystal-resort-room-status`
   - Directory: `./`
   - Override settings? **No**

5. Add environment variables:
   ```bash
   vercel env add VITE_FIREBASE_API_KEY
   vercel env add VITE_FIREBASE_AUTH_DOMAIN
   vercel env add VITE_FIREBASE_PROJECT_ID
   vercel env add VITE_FIREBASE_STORAGE_BUCKET
   vercel env add VITE_FIREBASE_MESSAGING_SENDER_ID
   vercel env add VITE_FIREBASE_APP_ID
   ```
   (Enter the values when prompted)

6. Deploy to production:
   ```bash
   vercel --prod
   ```

7. Add custom domain:
   ```bash
   vercel domains add crystalresort.app
   ```

## Step 3: Verify Deployment

1. Wait for deployment to complete (usually 1-2 minutes)
2. Visit https://crystalresort.app/
3. Test the app functionality:
   - Login with a nickname
   - Upload a PDF report
   - Change room status
   - Verify real-time sync works

## Troubleshooting

### Build Fails
- Check that all environment variables are set correctly
- Verify Firebase credentials are valid
- Check build logs in Vercel dashboard

### Domain Not Working
- Verify DNS settings point to Vercel
- Wait for DNS propagation (can take up to 24 hours)
- Check domain configuration in Vercel dashboard

### App Not Loading
- Check browser console for errors
- Verify Firebase configuration
- Check Firestore security rules allow read/write

## Important Notes

- **Environment Variables**: Make sure all Firebase env vars are set in Vercel dashboard
- **Firestore Rules**: Ensure your Firestore security rules allow access (or set up proper authentication)
- **Build Output**: Vercel should automatically detect Vite and use `dist` as output directory

