// -------------------- Load ENV --------------------
require("dotenv").config();

// -------------------- Imports --------------------
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const methodOverride = require("method-override");
const path = require("path");

// Models
const User = require("./models/User");
const Item = require("./models/Item");

const app = express();

// -------------------- ENV Vars --------------------
const { MONGO_URI, SESSION_SECRET, PORT, NODE_ENV } = process.env;
const isProd = NODE_ENV === "production";

// -------------------- MongoDB Connection --------------------
if (!MONGO_URI) {
    console.error("❌ MONGO_URI missing in .env");
    process.exit(1);
}

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => {
        console.error("❌ MongoDB Error:", err);
        process.exit(1);
    });

// -------------------- Middleware Setup --------------------
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));

// -------------------- Session Setup --------------------
app.use(
    session({
        secret: SESSION_SECRET || "default_secret",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: isProd,
            maxAge: 1000 * 60 * 60 * 24 * 7,
            sameSite: isProd ? "none" : "lax",
        },
        store: MongoStore.create({
            mongoUrl: MONGO_URI,
            ttl: 60 * 60 * 24 * 7,
        }),
    })
);

// -------------------- Auth Middleware --------------------
const isLoggedIn = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect("/login");
};

// -------------------- Routes --------------------

// Home
app.get("/", (req, res) => {
    res.render("index", {
        title: "Home",
        user: req.session.user || null,
    });
});

// Register
app.get("/register", (req, res) => {
    if (req.session.user) return res.redirect("/");
    res.render("register", { title: "Register", error: null });
});

app.post("/register", async (req, res) => {
    try {
        const { username, password } = req.body;

        const exists = await User.findOne({ username });
        if (exists) {
            return res.render("register", {
                title: "Register",
                error: "❌ Username already exists",
            });
        }

        const user = new User({ username, password });
        await user.save();

        req.session.user = { _id: user._id, username: user.username };
        res.redirect("/");
    } catch (err) {
        console.error("REGISTER ERROR:", err);
        res.render("register", {
            title: "Register",
            error: "❌ Registration failed. Try again.",
        });
    }
});

// Login
app.get("/login", (req, res) => {
    if (req.session.user) return res.redirect("/");
    res.render("login", { title: "Login", error: null });
});

app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ username });
        if (!user)
            return res.render("login", {
                title: "Login",
                error: "❌ Invalid username or password",
            });

        const match = await user.comparePassword(password);
        if (!match)
            return res.render("login", {
                title: "Login",
                error: "❌ Invalid username or password",
            });

        req.session.user = { _id: user._id, username: user.username };
        res.redirect("/");
    } catch (err) {
        console.error("LOGIN ERROR:", err);
        res.render("login", {
            title: "Login",
            error: "❌ Something went wrong",
        });
    }
});

// Logout
app.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/"));
});

// Inventory page
app.get("/inventory", isLoggedIn, async (req, res) => {
    const items = await Item.find({ user: req.session.user._id }).sort({ dateAcquired: -1 });

    res.render("inventory", {
        title: "Inventory",
        items,
        user: req.session.user,
    });
});

// Add item
app.get("/add", isLoggedIn, (req, res) => {
    res.render("add", { title: "Add Item", user: req.session.user });
});

app.post("/add", isLoggedIn, async (req, res) => {
    try {
        const { name, category, quantity, dateAcquired } = req.body;

        const item = new Item({
            name,
            category,
            quantity: Math.max(0, Number(quantity)),
            dateAcquired,
            user: req.session.user._id,
        });

        await item.save();
        res.redirect("/inventory");
    } catch (err) {
        console.error("ADD ERROR:", err);
        res.redirect("/add");
    }
});

// Edit item
app.get("/edit/:id", isLoggedIn, async (req, res) => {
    const item = await Item.findById(req.params.id);

    if (!item || item.user.toString() !== req.session.user._id)
        return res.redirect("/inventory");

    res.render("edit", { title: "Edit Item", item, user: req.session.user });
});

app.put("/edit/:id", isLoggedIn, async (req, res) => {
    const { name, category, quantity, dateAcquired } = req.body;

    await Item.findOneAndUpdate(
        { _id: req.params.id, user: req.session.user._id },
        { name, category, quantity, dateAcquired }
    );

    res.redirect("/inventory");
});

// Delete
app.delete("/delete/:id", isLoggedIn, async (req, res) => {
    await Item.deleteOne({ _id: req.params.id, user: req.session.user._id });
    res.redirect("/inventory");
});

// Stats
app.get("/stats", isLoggedIn, async (req, res) => {
    const items = await Item.find({ user: req.session.user._id });
    const totalItems = items.length;
    const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);

    const categoryCount = {};
    items.forEach((i) => {
        categoryCount[i.category] = (categoryCount[i.category] || 0) + 1;
    });

    res.render("stats", {
        title: "Statistics",
        totalItems,
        totalQuantity,
        categoryCount,
        user: req.session.user,
    });
});

// 404
app.use((req, res) => {
    res.status(404).render("404", {
        title: "404 Not Found",
        user: req.session.user || null,
    });
});

// -------------------- Start Server --------------------
app.listen(PORT || 3000, () => {
    console.log(`🚀 Server running on port ${PORT || 3000}`);
});
