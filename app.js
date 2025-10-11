// Load environment variables from .env file
// This should be at the very top of your file.
require('dotenv').config();

const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
// Import for production-ready session store
const MongoStore = require('connect-mongo'); 
const path = require("path");
const methodOverride = require("method-override");
const bcrypt = require('bcryptjs'); // For password hashing utility (if used directly)

// --- MODEL IMPORTS (Assuming these files exist) ---
const User = require("./models/User");
const Item = require("./models/Item");
// -------------------------------

const app = express();
// Destructure variables from process.env for clarity and consistent access
const { MONGO_URI, PORT, SESSION_SECRET, NODE_ENV } = process.env;

// Determine environment status
const isProduction = NODE_ENV === 'production';

// ---------- Connect MongoDB (Using MONGO_URI from env) ----------
// Use the production URI or the local one based on env
const mongoUri = isProduction ? MONGO_URI : 'mongodb://127.0.0.1:27017/inventoryDB'; 
mongoose.connect(mongoUri) 
    .then(() => console.log(`✅ MongoDB connected to: ${mongoUri.substring(0, 30)}...`)) // Mask URI for console log
    .catch(err => {
        console.error("❌ MongoDB connection error:", err);
        // Terminate application if database connection fails early
        process.exit(1); 
    });
// ----------------------------------------------------------------

// ---------- Middleware ----------
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true })); // Parse incoming request bodies
app.use(methodOverride("_method")); // Allows PUT/DELETE requests from forms

// --- Session Configuration (Secure and Scalable) ---
const sessionConfig = {
    // 1. Use the secure SECRET from environment variables
    secret: SESSION_SECRET || 'a_fallback_secret_for_dev_only', 
    name: 'inventory_sid', // Good practice to use a generic name
    resave: false,
    saveUninitialized: false,
    cookie: {
        // Secure cookies are required in production (requires HTTPS)
        secure: isProduction, 
        // Prevents client-side JS from accessing the cookie
        httpOnly: true, 
        // Sessions expire after a week
        maxAge: 1000 * 60 * 60 * 24 * 7,
        // Set sameSite policy (Crucial for cross-site cookie usage in production, e.g., if API is separate)
        sameSite: isProduction ? 'none' : 'lax'
    },
    // 2. Use a persistent store (MongoDB) in production
    store: isProduction ? MongoStore.create({
        mongoUrl: MONGO_URI,
        touchAfter: 24 * 3600 // Only update session in database once every 24hrs unless a change is made
    }) : undefined // Use default MemoryStore in development
};

app.use(session(sessionConfig));

// --- Custom Middleware for Authentication Check ---
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        // Check if user object has the necessary properties before proceeding
        if (!req.session.user._id) { 
            // Incomplete session data, destroy and redirect to login
            req.session.destroy(() => res.redirect("/login"));
            return;
        }
        return next();
    }
    // Redirect unauthenticated users to login
    res.redirect("/login");
};
// --------------------------------------------------

// ---------- Routes (as provided, but simplified/commented for clarity) ----------

// Home
app.get("/", (req, res) => {
    res.render("index", { title: "Home", user: req.session.user || null });
});

// User Authentication Routes (Register, Login, Logout)
app.get("/register", (req, res) => {
    if (req.session.user) return res.redirect("/"); 
    res.render("register", { title: "Register", error: null, user: null });
});

app.post("/register", async (req, res) => {
    const { username, password } = req.body; 
    try {
        const exists = await User.findOne({ username });
        if (exists) return res.render("register", { title: "Register", error: "Username already exists.", user: null });

        const user = new User({ username, password });
        await user.save();
        
        req.session.user = { _id: user._id, username: user.username };
        res.redirect("/");
    } catch (err) {
        console.error("Registration error:", err);
        res.render("register", { title: "Register", error: "Registration failed. Try again.", user: null });
    }
});

app.get("/login", (req, res) => {
    if (req.session.user) return res.redirect("/"); 
    res.render("login", { title: "Login", error: null, user: null });
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        const authError = "Invalid username or password.";

        if (!user) return res.render("login", { title: "Login", error: authError, user: null });

        // Assumes User.js has a 'comparePassword' method
        const match = await user.comparePassword(password); 
        if (!match) return res.render("login", { title: "Login", error: authError, user: null });

        req.session.user = { _id: user._id, username: user.username };
        res.redirect("/"); 
    } catch (err) {
        console.error("Login error:", err);
        res.render("login", { title: "Login", error: "Something went wrong during login.", user: null });
    }
});

app.get("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) console.error("Logout error:", err);
        res.redirect("/");
    });
});

// Inventory Routes (Protected by isAuthenticated)
app.get("/inventory", isAuthenticated, async (req, res) => {
    const items = await Item.find({ user: req.session.user._id }).sort({ dateAcquired: -1 }); 
    res.render("inventory", { title: "Inventory", items, user: req.session.user });
});

app.get("/add", isAuthenticated, (req, res) => {
    res.render("add", { title: "Add Item", user: req.session.user }); 
});

app.post("/add", isAuthenticated, async (req, res) => {
    try {
        const { name, category, quantity, dateAcquired } = req.body;
        const item = new Item({
            name,
            category,
            quantity: Math.max(0, Number(quantity) || 0), 
            dateAcquired,
            user: req.session.user._id
        });
        await item.save();
        res.redirect("/inventory");
    } catch (err) {
        console.error("Add item error:", err);
        res.redirect("/add");
    }
});

app.get("/edit/:id", isAuthenticated, async (req, res) => {
    try {
        const item = await Item.findById(req.params.id);
        if (!item || item.user.toString() !== req.session.user._id) {
            return res.redirect("/inventory");
        }
        res.render("edit", { title: "Edit Item", item, user: req.session.user });
    } catch (err) {
        console.error("Edit show form error:", err);
        res.redirect("/inventory");
    }
});

app.put("/edit/:id", isAuthenticated, async (req, res) => {
    try {
        const { name, category, quantity, dateAcquired } = req.body;
        
        const item = await Item.findOneAndUpdate(
            { _id: req.params.id, user: req.session.user._id },
            { name, category, quantity: Math.max(0, Number(quantity) || 0), dateAcquired },
            { new: true } 
        );

        if (!item) return res.redirect("/inventory"); 
        
        res.redirect("/inventory");
    } catch (err) {
        console.error("Edit item submit error:", err);
        res.redirect("/inventory");
    }
});

app.delete("/delete/:id", isAuthenticated, async (req, res) => {
    try {
        await Item.deleteOne({ _id: req.params.id, user: req.session.user._id });
        res.redirect("/inventory");
    } catch (err) {
        console.error("Delete item error:", err);
        res.redirect("/inventory");
    }
});

app.get("/stats", isAuthenticated, async (req, res) => {
    try {
        const items = await Item.find({ user: req.session.user._id });
        const totalItems = items.length;
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
        res.redirect("/inventory"); 
    }
});  

// 404 Handler (should be the last route)
app.use((req, res, next) => {
    res.status(404).render('404', { title: '404 Not Found', user: req.session.user || null });
});


// Start Server
const MONGO = MONGO_URI || PORT; 
app.listen(PORT_ENV, () => {
    console.log(`Server is running in ${NODE_ENV} mode on port ${PORT_ENV}`);
    console.log(`Access at: http://localhost:${PORT_ENV}`);
});