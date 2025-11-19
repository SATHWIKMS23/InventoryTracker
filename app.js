require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');

const User = require('./models/User');

const app = express();

// -------------------------
// MIDDLEWARES
// -------------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));

// SESSION
app.use(session({
    secret: process.env.SESSION_SECRET || "defaultsecret",
    resave: false,
    saveUninitialized: false,
}));

// -------------------------
// MONGO CONNECTION
// -------------------------
const mongoUri = process.env.MONGO_URI;

mongoose.connect(mongoUri)
    .then(() => console.log("✅ MongoDB connected"))
    .catch(err => {
        console.error("❌ MongoDB ERROR:", err);
        process.exit(1);
    });

// -------------------------
// ROUTES
// -------------------------

// HOME
app.get("/", (req, res) => {
    res.send("Server Running...");
});

// -------------------------
// SHOW REGISTER PAGE
// -------------------------
app.get("/register", (req, res) => {
    res.render("register", {
        title: "Register",
        error: null
    });
});

// -------------------------
// REGISTER USER
// -------------------------
app.post("/register", async (req, res) => {
    try {
        const { email, username, password } = req.body;

        console.log("📥 Received Register:", req.body);

        // Check email exists
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
            return res.render("register", {
                title: "Register",
                error: "Email already exists."
            });
        }

        // Check username exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.render("register", {
                title: "Register",
                error: "Username already exists."
            });
        }

        // Create user
        const newUser = new User({ email, username, password });
        await newUser.save();

        console.log("✅ User Registered:", username);

        return res.redirect("/login");

    } catch (err) {
        console.error("❌ REGISTER ERROR:", err);
        return res.render("register", {
            title: "Register",
            error: "Registration failed. Try again."
        });
    }
});

// -------------------------
// SHOW LOGIN PAGE
// -------------------------
app.get("/login", (req, res) => {
    res.render("login", {
        title: "Login",
        error: null
    });
});

// -------------------------
// LOGIN USER
// -------------------------
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log("📥 Received Login:", req.body);

        const user = await User.findOne({ email });
        if (!user) {
            return res.render("login", {
                title: "Login",
                error: "User not found."
            });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.render("login", {
                title: "Login",
                error: "Incorrect password."
            });
        }

        // Save session
        req.session.userId = user._id;

        console.log("✅ Login Success:", email);

        return res.redirect("/dashboard");

    } catch (err) {
        console.error("❌ LOGIN ERROR:", err);
        return res.render("login", {
            title: "Login",
            error: "Login failed. Try again."
        });
    }
});

// -------------------------
// DASHBOARD
// -------------------------
app.get("/dashboard", (req, res) => {
    if (!req.session.userId) {
        return res.redirect("/login");
    }
    res.send("Welcome to Dashboard!");
});

// -------------------------
// START SERVER
// -------------------------
app.listen(process.env.PORT, () => {
    console.log(`🚀 Server running on port ${process.env.PORT}`);
});
