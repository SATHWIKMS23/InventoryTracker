const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const path = require("path");
const methodOverride = require("method-override");

// --- CORRECTED MODEL IMPORTS ---
const User = require("./models/User");
const Item = require("./models/item");
// -------------------------------

const app = express();

// ---------- Middleware ----------
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));

app.use(session({
    secret: "mySecretKey",
    resave: false,
    saveUninitialized: false
}));

// ---------- Connect MongoDB ----------
mongoose.connect("mongodb://127.0.0.1:27017/inventoryDB", {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.log(err));

// ---------- Routes ----------

// Home
app.get("/", (req, res) => {
    res.render("index", { title: "Home", user: req.session.user || null });
});

// --------- REGISTER ---------
// Show register form
app.get("/register", (req, res) => {
    res.render("register", { title: "Register", error: null, user: req.session.user || null });
});

// Handle new user
app.post("/register", async (req, res) => {
    const { username, password } = req.body; 
    try {
        const exists = await User.findOne({ username });
        if (exists) return res.render("register", { title: "Register", error: "Username already exists.", user: req.session.user || null });

        const user = new User({ username, password });
        await user.save();
        res.redirect("/login");
    } catch (err) {
        console.log(err);
        res.render("register", { title: "Register", error: "Something went wrong.", user: req.session.user || null });
    }
});

// --------- LOGIN ---------
// Show login form
app.get("/login", (req, res) => res.render("login", { title: "Login", error: null, user: req.session.user || null }));

// Handle login
app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) return res.render("login", { title: "Login", error: "Invalid username or password.", user: req.session.user || null });

        const match = await user.comparePassword(password);
        if (!match) return res.render("login", { title: "Login", error: "Invalid username or password.", user: req.session.user || null });

        req.session.user = { _id: user._id, username: user.username };
        
        // --- FIX: Redirect to Home Page (/) ---
        res.redirect("/"); 
        // -------------------------------------
    } catch (err) {
        console.log(err);
        res.render("login", { title: "Login", error: "Something went wrong.", user: req.session.user || null });
    }
});

// --------- LOGOUT ---------
app.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/"));
});

// --------- INVENTORY ---------
app.get("/inventory", async (req, res) => {
    if (!req.session.user) return res.redirect("/login");
    const items = await Item.find({ user: req.session.user._id });
    res.render("inventory", { title: "Inventory", items, user: req.session.user });
});

// Add Item
app.get("/add", (req, res) => {
    if (!req.session.user) return res.redirect("/login");
    res.render("add", { title: "Add Item", user: req.session.user }); 
});

app.post("/add", async (req, res) => {
    if (!req.session.user) return res.redirect("/login");
    const { name, category, quantity, dateAcquired } = req.body;
    const item = new Item({
        name,
        category,
        quantity: Number(quantity),
        dateAcquired,
        user: req.session.user._id
    });
    await item.save();
    res.redirect("/inventory");
});

// Edit Item
app.get("/edit/:id", async (req, res) => {
    if (!req.session.user) return res.redirect("/login");
    const item = await Item.findById(req.params.id);
    if (!item || item.user.toString() !== req.session.user._id) return res.redirect("/inventory");
    res.render("edit", { title: "Edit Item", item, user: req.session.user }); 
});

app.put("/edit/:id", async (req, res) => {
    if (!req.session.user) return res.redirect("/login");
    const { name, category, quantity, dateAcquired } = req.body;
    const item = await Item.findById(req.params.id);
    if (!item || item.user.toString() !== req.session.user._id) return res.redirect("/inventory");

    item.name = name;
    item.category = category;
    item.quantity = Number(quantity);
    item.dateAcquired = dateAcquired;
    await item.save();
    res.redirect("/inventory");
});

// Delete Item
app.delete("/delete/:id", async (req, res) => {
    if (!req.session.user) return res.redirect("/login");
    const item = await Item.findById(req.params.id);
    if (!item || item.user.toString() !== req.session.user._id) return res.redirect("/inventory");
    await item.deleteOne();
    res.redirect("/inventory");
});

app.get("/Stats", async (req, res) => {
    if (!req.session.user) return res.redirect("/login");
    const items = await Item.find({ user: req.session.user._id });
    const totalItems = items.length;
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const categoryCount = {};       
    items.forEach(item => {
        categoryCount[item.category] = (categoryCount[item.category] || 0) + 1;
    });
    res.render("stats", { title: "Statistics", totalItems, totalQuantity, categoryCount, user: req.session.user });
});  

// Start Server
app.listen(3000, () => console.log("✅ Server running on http://localhost:3000"));