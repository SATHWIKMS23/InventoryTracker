const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); 

const UserSchema = new mongoose.Schema({
    // ... other fields
    password: { type: String, required: true }
});

// 1. HASH PASSWORD BEFORE SAVING (for new users/password changes)
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// 2. METHOD TO COMPARE PASSWORD DURING LOGIN
UserSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
// NOTE: You must also run 'npm install bcryptjs' if you haven't already.