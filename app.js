// Load environment variables from .env file (if using one)
// This should be at the very top of your file.
require('dotenv').config();

const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require('connect-mongo'); // Import for production-ready session store
const path = require("path");
const methodOverride = require("method-override");
const bcrypt = require('bcryptjs'); // Import for secure password hashing (assuming User model uses it)

// --- CORRECTED MODEL IMPORTS ---
// Assuming these models are properly defined with Mongoose Schemas in their respective files.
const User = require("./models/User");
const Item = require("./models/Item");
// -------------------------------

const app = express();
// Destructure variables from process.env for clarity and consistent access
const { MONGO_URI, PORT, SESSION_SECRET, NODE_ENV } = process.env;

// ---------- Connect MongoDB (Using MONGO_URI from env) ----------
const mongoUri = NODE_ENV === 'production' ? MONGO_URI : 'mongodb://127.0.0.1:27017/inventoryDB';
mongoose.connect(mongoUri) // Use the production URI or the local one based on env
    .then(() => console.log(`✅ MongoDB connected to: ${mongoUri}`))
    .catch(err => console.error("❌ MongoDB connection error:", err));
// ----------------------------------------------------------------

// ---------- Middleware ----------
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));

// --- Session Configuration (Improved for Security and Scalability) ---
const isProduction = NODE_ENV === 'production';

const sessionConfig = {
    // 1. Use the secure SECRET from environment variables
    secret: SESSION_SECRET || 'a_fallback_secret_for_dev_only', 
    resave: false,
    saveUninitialized: false,
    cookie: {
        // Secure cookies are required in production
        secure: isProduction, 
        // Prevents client-side JS from accessing the cookie
        httpOnly: true, 
        // Sessions expire after a week (for example)
        maxAge: 1000 * 60 * 60 * 24 * 7 
    },
    // 2. Use a persistent store (like MongoDB) in production
    store: isProduction ? MongoStore.create({
        mongoUrl: MONGO_URI,
        touchAfter: 24 * 3600 // Only update session in database once every 24hrs unless a change is made
    }) : undefined // Use default MemoryStore in development
};

// If in production, ensure the `sameSite` attribute is set
if (isProduction) {
    sessionConfig.cookie.sameSite = 'none';
}

app.use(session(sessionConfig));

// --- Custom Middleware for Authentication Check ---
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    // Redirect unauthenticated users to login
    res.redirect("/login");
};
// --------------------------------------------------

// ---------- Routes ----------

// Home
app.get("/", (req, res) => {
    res.render("index", { title: "Home", user: req.session.user || null });
});

// --------- REGISTER ---------
// Show register form
app.get("/register", (req, res) => {
    // Redirect logged-in users away from register page
    if (req.session.user) return res.redirect("/"); 
    res.render("register", { title: "Register", error: null, user: null });
});

// Handle new user
app.post("/register", async (req, res) => {
    const { username, password } = req.body; 
    try {
        const exists = await User.findOne({ username });
        if (exists) return res.render("register", { title: "Register", error: "Username already exists.", user: null });

        // NOTE: The User model MUST include a pre-save hook to hash the password
        // before creating the user. If it doesn't, this is a major security flaw.
        const user = new User({ username, password });
        await user.save();
        
        // Optional: Log the user in immediately after successful registration
        req.session.user = { _id: user._id, username: user.username };
        res.redirect("/");

    } catch (err) {
        console.error("Registration error:", err);
        // Better error message for password validation etc. is usually needed here
        res.render("register", { title: "Register", error: "Something went wrong during registration.", user: null });
    }
});

// --------- LOGIN ---------
// Show login form
app.get("/login", (req, res) => {
    // Redirect logged-in users away from login page
    if (req.session.user) return res.redirect("/"); 
    res.render("login", { title: "Login", error: null, user: null });
});

// Handle login
app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        
        // Use a generic message for both cases for security
        const authError = "Invalid username or password.";

        if (!user) return res.render("login", { title: "Login", error: authError, user: null });

        // IMPORTANT: Assumes User.js has a 'comparePassword' method using bcrypt/argon2
        const match = await user.comparePassword(password); 
        if (!match) return res.render("login", { title: "Login", error: authError, user: null });

        // Set session with minimal user data
        req.session.user = { _id: user._id, username: user.username };
        
        // Redirect to Home Page (/)
        res.redirect("/"); 
    } catch (err) {
        console.error("Login error:", err);
        res.render("login", { title: "Login", error: "Something went wrong during login.", user: null });
    }
});

// --------- LOGOUT ---------
app.get("/logout", (req, res) => {
    // Clear session and redirect
    req.session.destroy(err => {
        if (err) console.error("Logout error:", err);
        res.redirect("/");
    });
});

// --------- INVENTORY (Protected Routes) ---------

// Get all inventory items for the user
app.get("/inventory", isAuthenticated, async (req, res) => {
    const items = await Item.find({ user: req.session.user._id }).sort({ dateAcquired: -1 }); // Added sorting
    res.render("inventory", { title: "Inventory", items, user: req.session.user });
});

// Show Add Item form
app.get("/add", isAuthenticated, (req, res) => {
    res.render("add", { title: "Add Item", user: req.session.user }); 
});

// Handle Add Item submission
app.post("/add", isAuthenticated, async (req, res) => {
    // Use try/catch block for better error handling on database operations
    try {
        const { name, category, quantity, dateAcquired } = req.body;
        const item = new Item({
            name,
            category,
            // Ensure quantity is treated as a safe number
            quantity: Math.max(0, Number(quantity) || 0), 
            dateAcquired,
            user: req.session.user._id
        });
        await item.save();
        res.redirect("/inventory");
    } catch (err) {
        console.error("Add item error:", err);
        // You might want to redirect with an error message in a real app
        res.redirect("/add");
    }
});

// Show Edit Item form
app.get("/edit/:id", isAuthenticated, async (req, res) => {
    try {
        const item = await Item.findById(req.params.id);
        // Check for item existence AND ownership in one clean line
        if (!item || item.user.toString() !== req.session.user._id) {
            return res.redirect("/inventory");
        }
        res.render("edit", { title: "Edit Item", item, user: req.session.user });
    } catch (err) {
        console.error("Edit show form error:", err);
        res.redirect("/inventory");
    }
});

// Handle Edit Item submission
app.put("/edit/:id", isAuthenticated, async (req, res) => {
    try {
        const { name, category, quantity, dateAcquired } = req.body;
        
        // Find by ID and Owner ID for safety and efficiency
        const item = await Item.findOneAndUpdate(
            { _id: req.params.id, user: req.session.user._id },
            {
                name,
                category,
                quantity: Math.max(0, Number(quantity) || 0),
                dateAcquired
            },
            { new: true } // Return the updated document
        );

        if (!item) {
            return res.redirect("/inventory"); // Item not found or doesn't belong to user
        }
        
        res.redirect("/inventory");
    } catch (err) {
        console.error("Edit item submit error:", err);
        res.redirect("/inventory");
    }
});

// Delete Item
app.delete("/delete/:id", isAuthenticated, async (req, res) => {
    try {
        // Find by ID and Owner ID and delete in one go
        const result = await Item.deleteOne({ 
            _id: req.params.id, 
            user: req.session.user._id 
        });

        // The result will show if an item was deleted (result.deletedCount > 0)
        // No need to check item ownership explicitly as the query handles it.
        res.redirect("/inventory");
    } catch (err) {
        console.error("Delete item error:", err);
        res.redirect("/inventory");
    }
});

// Stats Route
app.get("/stats", isAuthenticated, async (req, res) => {
    try {
        const items = await Item.find({ user: req.session.user._id });
        const totalItems = items.length;
        // Use reduce with an initial value of 0 for safety
        const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0); 
        
        const categoryCount = {};       
        items.forEach(item => {
            categoryCount[item.category] = (categoryCount[item.category] || 0) + 1;
        });

        res.render("stats", { 
            title: "Statistics", 
            totalItems, 
            totalQuantity, 
            categoryCount, 
            user: req.session.user 
        });
    } catch (err) {
        console.error("Stats error:", err);
        res.redirect("/inventory"); // Redirect on error
    }
});  

// Start Server
const PORT_ENV = PORT || 3000; // Use environment variable PORT or default to 3000
app.listen(PORT_ENV, () => {
    console.log(`Server is running in ${NODE_ENV} mode on port ${PORT_ENV}`);
});