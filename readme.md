Inventory Tracker Application
📋 Project Description
The Inventory Tracker is a full-stack web application designed to help users manage their personal or small business inventory. Users can register, log in, and track various items, including details like name, category, quantity, and date acquired. The application is built using the MERN Stack principles (MongoDB, Express, Node.js) with EJS used for templating.

✨ Features
User Authentication: Secure registration, login, and logout using express-session and bcrypt (assumed in the User model).

MongoDB Persistence: Stores user accounts and inventory data.

CRUD Operations: Users can Create, Read, Update, and Delete inventory items.

Session Management: Keeps users logged in with express-session.

Method Override: Allows PUT and DELETE requests from standard HTML forms.

Modern UI: Clean, modern, and responsive interface built with custom CSS.

🛠️ Technology Stack
Backend: Node.js, Express.js

Database: MongoDB (via Mongoose ODM)

Templating: EJS (Embedded JavaScript)

Security: express-session, bcrypt (for password hashing)

Utilities: method-override, path



📂 Project Structure
The key files and directories are organized as follows:

INVENTORYTRACKER/
├── models/
│   ├── item.js          # Mongoose schema for Inventory Items
│   └── User.js          # Mongoose schema for Users (with bcrypt methods)
├── public/
│   ├── Stylesheets/
│   │   ├── index.css    # General/layout styles (Header, Footer, body)
│   │   ├── inventory.css # Inventory list and table styles
│   │   └── forms.css    # Styles for Add/Edit forms
│   └── ... (Images, Javascript files)
├── views/
│   ├── partials/        # Reusable header, footer, etc.
│   ├── index.ejs
│   ├── inventory.ejs
│   ├── login.ejs
│   ├── register.ejs
│   └── app.js           # Main Express server and route definitions
├── package.json
└── README.md
📝 Usage
Navigate to http://localhost:3000.

Register a new account.

Log in with your credentials.

Navigate to the Inventory page to view, add, edit, or delete items.
