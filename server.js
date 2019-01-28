const express = require("express");
const mongo = require("mongodb");
const mongoose = require("mongoose");
const moment = require("moment");
const shortid = require("shortid");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
const db = mongoose.connection;
const Schema = mongoose.Schema;
const bodyParser = require("body-parser");
const dns = require("dns");
const url = require("url");

mongoose.connect(
  process.env.MLAB_URI,
  { useNewUrlParser: true }
);
mongoose.set("useFindAndModify", false);

db.on("error", console.error.bind(console, "connection error"));
db.once("open", () => console.log("DB ONLINE"));

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(express.static("public"));
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

// Schemas
const exerciseSchema = new Schema({
  _id: {
    type: String,
    default: shortid.generate
  },
  description: String,
  duration: Number,
  date: Date
});
const userSchema = new Schema({
  _id: {
    type: String,
    default: shortid.generate
  },
  name: String,
  count: { type: Number, default: 0 },
  exercises: [exerciseSchema]
});

// Models
const Exercise = mongoose.model("Exercise", exerciseSchema);
const User = mongoose.model("Person", userSchema);

// Not found middleware
app.use((req, res, next) => {
  if (req.body || req.params) return next();
  return next({ status: 404, message: "not found" });
});

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage;

  if (err.errors) {
    // mongoose validation error
    errCode = 400; // bad request
    const keys = Object.keys(err.errors);
    // report the first validation error
    errMessage = err.errors[keys[0]].message;
  } else {
    // generic or custom error
    errCode = err.status || 500;
    errMessage = err.message || "Internal Server Error";
  }
  res
    .status(errCode)
    .type("txt")
    .send(errMessage);
});

/**
 * Create user handler
 */
const createUserHandler = async (req, res, next) => {
  const user = await User.findOne({ name: req.body.username });
  if (user) {
    return res.status(200).json({
      _id: user._id,
      username: user.name,
      count: user.count
    });
  }
  const newUser = new User({
    name: req.body.username
  });
  try {
    await newUser.save();
    return res.status(201).json({ name: newUser.name, _id: newUser._id });
  } catch (err) {
    return next(err);
  }
};

/**
 * Add exercise handler
 */
const addExerciseHandler = async (req, res, next) => {
  const exercise = new Exercise({
    description: req.body.description,
    duration: req.body.duration,
    date: req.body.date || new Date()
  });
  try {
    const user = await User.findByIdAndUpdate(req.body.userId, {
      $push: {
        exercises: exercise
      },
      $inc: {
        count: 1
      }
    });
    return res.status(201).json({
      username: user.name,
      description: req.body.description,
      duration: req.body.duration,
      _id: user._id,
      date: req.body.date
        ? new Date(req.body.date).toDateString()
        : new Date().toDateString()
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * Get user info handler
 */
const getUserHandler = async (req, res, next) => {
  const query = req.query;
  const from = query.from || null;
  const to = query.to || null;
  const limit = query.limit || null;
  try {
    let user = await User.findById(query.userId)
      .select("_id name count exercises")
      .exec();
    let userClone = { ...user.toObject() };
    if (userClone.exercises && userClone.exercises.length) {
      userClone.exercises = userClone.exercises.map(ex => (ex = { ...ex }));
      userClone.exercises.forEach(ex => (ex.date = ex.date.toDateString()));
      if (from || to) {
        userClone.exercises = userClone.exercises.filter(ex => {
          if (
            from &&
            ex.date &&
            moment(ex.date).isBefore(new Date(from), "day")
          )
            return false;
          if (to && ex.date && moment(ex.date).isAfter(new Date(to), "day"))
            return false;
          return ex;
        });
      }
      if (limit && limit < userClone.exercises.length) {
        userClone.exercises.length = limit;
      }
    }
    return res.status(200).json(userClone);
  } catch (err) {
    return next(err);
  }
};

/**
 * Get all users handler
 */
const getAllUsersHandlers = async (req, res, next) => {
  try {
    const users = await User.find({}).select("_id name");
    return res.status(200).json(users);
  } catch (err) {
    return next(err);
  }
};

// ENDPOINTS
// Create user
app.post("/api/exercise/new-user", createUserHandler);
// Add exercise
app.post("/api/exercise/add", addExerciseHandler);
// Get exercises
app.get("/api/exercise/log/:userId?", getUserHandler);
// Get all users
app.get("/api/exercise/users", getAllUsersHandlers);

// SERVER LISTENING
const listener = app.listen(port, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
