# Deploying Vutto to Render (Node.js + SQLite Persistent Disk)

Because Render uses an ephemeral filesystem, if your application restarts, updates, or scales, standard SQLite files stored in the root directory will be completely wiped out. 

To prevent this, you must deploy Vutto as a **Render Web Service** and mount a **Render Persistent Disk** to store the SQLite database file.

---

## Step 1: Push Your Code to GitHub

1. Create a new repository on [GitHub](https://github.com).
2. Open your terminal in the root directory of the project (`vutto/`) and run:
   ```bash
   git init
   git add .
   git commit -m "Initialize Vutto Bike Auction Platform"
   ```
3. Link your local repository to your GitHub repository and push:
   ```bash
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git push -u origin main
   ```

---

## Step 2: Create a Web Service on Render

1. Log in to the [Render Dashboard](https://dashboard.render.com).
2. Click the **New +** button and select **Web Service**.
3. Connect your GitHub repository.
4. Configure the Web Service settings:
   - **Name**: `vutto-bike-auction` (or any name you prefer)
   - **Region**: Select the region closest to you
   - **Branch**: `main`
   - **Language**: `Node`
   - **Build Command**: `npm install` (Note: Since we are zero-dependency, this step is just a standard command and will run instantly)
   - **Start Command**: `node server/index.js`
   - **Plan**: Select **Free** (or a paid tier if you want persistent disk support)
     > [!IMPORTANT]
     > Render's **Free Tier** does not support mounting Persistent Disks. To persist the SQLite database across restarts and deployments, you must select at least the **Starter** tier (usually $7/month).

---

## Step 3: Configure environment variables

In the **Environment** tab of your Render Web Service settings, add the following environment variables:

| Key | Value | Description |
|---|---|---|
| `NODE_ENV` | `production` | Set server behavior to production |
| `PORT` | `10000` | Port Render forwards incoming traffic to (e.g. `10000` or `8080`) |
| `JWT_SECRET` | `your-secret-key-phrase` | A long, secure random string for JWT token generation |
| `SQLITE_DB_PATH` | `/var/data/database.db` | Points database instance to the persistent disk directory |

---

## Step 4: Configure the Persistent Disk

To store your SQLite database file permanently:

1. In your Render Web Service settings, scroll down to the **Disks** section.
2. Click **Add Disk** (Requires Starter plan or higher).
3. Set the configuration details:
   - **Name**: `vutto-db-volume`
   - **Mount Path**: `/var/data`
   - **Size**: `1 GB` (More than enough for storing SQLite database tables and indices)
4. Click **Save Changes**.

Render will automatically restart your app, mount the persistent disk volume at `/var/data`, and route your database connection to `/var/data/database.db` as defined in your environment variables. Your data will now survive restarts, redeploys, and crashes!
