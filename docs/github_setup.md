# Step-by-Step Guide: Creating a GitHub Repository

This document guides you through creating a new repository on GitHub and pushing your local Vutto Bike Auction Platform code to it.

---

## Part 1: Create a Repository on the GitHub Website

1. Open your browser and go to [GitHub](https://github.com). Log in to your account.
2. In the top-right corner of the page, click the **+** (plus) icon and select **New repository**.
3. Fill in the repository details:
   - **Repository name**: `vutto-bike-auction` (or any name you prefer)
   - **Description** (optional): `Bike Auction Platform with 10-day active listings and unique views.`
   - **Public/Private**: Select **Public** if you want Render to access it easily, or **Private** (Render can still connect to private repositories if you grant access).
   - **Initialize this repository with**: **Leave all checkboxes unchecked** (Do not add a README, `.gitignore`, or license, since the Vutto codebase already has these files).
4. Click the green **Create repository** button.

---

## Part 2: Push Your Local Code to GitHub

Open your command prompt or terminal in the root directory of the project (`c:/Users/sai kumar/OneDrive/Desktop/vutto`) and run the following commands:

1. **Initialize Git in the project folder**:
   ```bash
   git init
   ```

2. **Add all files to Git tracking**:
   ```bash
   git add .
   ```

3. **Commit the files**:
   ```bash
   git commit -m "Initial commit: Vutto Auction Platform"
   ```

4. **Set the default branch name to main**:
   ```bash
   git branch -M main
   ```

5. **Link your local folder to your GitHub repository**:
   *(Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your actual GitHub username and the repository name you created)*:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   ```

6. **Push the code to GitHub**:
   ```bash
   git push -u origin main
   ```

Once completed, refresh your GitHub page to see all Vutto project files uploaded successfully!
