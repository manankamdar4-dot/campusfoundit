# CampusFoundIt

**Lost & Found Platform for NMIMS Mumbai.**
A clean, official digital system to report, match, and recover lost items on campus. Replaces unorganized WhatsApp groups with a fast, trusted web app.

*Live URL: campusfoundit.github.io*

---

## ⚡ Features
- **Report Lost Items:** Submit detailed reports including a hidden verification detail to prove ownership.
- **Report Found Items:** Help the community by logging found items.
- **Auto-Matching Algorithm:** System automatically scores similarities between lost and found items (Color, Category, Keywords, Location).
- **Public Browse:** Search and filter all found items to check if your item was turned in.
- **Admin Dashboard:** Secure portal to view full databases, review AI-suggested matches, and confirm them.
- **Automated Emails:** When admin confirms a match, both the Owner and the Finder instantly receive templated email notifications.

---

## 🛠️ Tech Stack
- **Frontend:** HTML5, CSS3 (Custom Design System), Vanilla JS
- **Backend:** Node.js, Express.js
- **Database:** SQLite3 (`better-sqlite3`)
- **File Uploads:** Multer
- **Emails:** Nodemailer (Gmail SMTP)
- **Deployment Strategy:** Frontend on GitHub Pages, Backend on Render.com (Free Tier).

---

## 🚀 Local Setup Instructions

### 1. Prerequisites
- [Node.js](https://nodejs.org/) installed on your machine.
- A Gmail account with **App Passwords** enabled for the email notifications to work.

### 2. Backend Setup
1. Open a terminal and navigate to the `backend` folder:
   ```bash
   cd campusfoundit/backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the `backend` folder:
   ```env
   PORT=3000
   ADMIN_PASSWORD=admin123
   GMAIL_USER=your_gmail@gmail.com
   GMAIL_PASS=your_gmail_app_password
   FRONTEND_URL=http://127.0.0.1:5500
   ```
4. Start the server:
   ```bash
   npm start
   ```
   *The server will run on http://localhost:3000 and automatically create the SQLite database and `uploads` folder on first run.*

### 3. Frontend Setup
1. Open the `frontend` folder.
2. Ensure `frontend/js/config.js` is pointing to your local backend:
   ```javascript
   const CONFIG = { API_BASE_URL: 'http://localhost:3000' };
   ```
3. Run the frontend using a local server (like the VS Code "Live Server" extension).
   - If using Live Server, it usually runs on `http://127.0.0.1:5500`.
4. Open your browser and navigate to the frontend URL!

---

## 🌐 Production Deployment Guide

### 1. Deploy the Backend (Render)
1. Push your full repository to GitHub.
2. Go to [Render.com](https://render.com) and create a new **Web Service**.
3. Connect your GitHub repository.
4. Set the **Root Directory** to `backend`.
5. Set the Build Command: `npm install`
6. Set the Start Command: `node server.js`
7. Add the required Environment Variables (`ADMIN_PASSWORD`, `GMAIL_USER`, `GMAIL_PASS`, `FRONTEND_URL`).
8. Deploy. Copy the generated URL (e.g., `https://campusfoundit-api.onrender.com`).

### 2. Deploy the Frontend (GitHub Pages)
1. Open `frontend/js/config.js` and change the URL to your Render backend URL:
   ```javascript
   const CONFIG = { API_BASE_URL: 'https://campusfoundit-api.onrender.com' };
   ```
2. Commit and push this change to GitHub.
3. If your repo is named `campusfoundit`, go to Settings > Pages, set the source to `main` branch and `/frontend` folder (if using a specific setup, or just deploy the frontend folder as its own repo).
4. Your site is live!

---

## 🔒 Admin Access
- Navigate to the `Admin Login` page via the navbar.
- Default password is `admin123` (editable in backend `.env`).
- Use the dashboard to review suggested matches, contact students, and log returned items.

---
*Developed as a college project for NMIMS Mumbai.*
