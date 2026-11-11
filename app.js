require("dotenv").config();

var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");

var indexRouter = require("./routes/index");
var usersRouter = require("./routes/users");
var authRouter = require("./routes/auth");
var meRouter = require("./routes/me");
var sectorsRouter = require("./routes/sectors");
var companiesRouter = require("./routes/companies");
var watchlistRouter = require("./routes/watchlist");
var themesRouter = require("./routes/themes");
var adminRouter = require("./routes/admin");

var app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/auth", authRouter);
app.use("/me", meRouter);
app.use("/sectors", sectorsRouter);
app.use("/companies", companiesRouter);
app.use("/watchlist", watchlistRouter);
app.use("/themes", themesRouter);
app.use("/admin/api", adminRouter);

var swaggerUi = require("swagger-ui-express");
var openapi = require("./docs/openapi");
app.get("/docs.json", function (req, res) { res.json(openapi); });
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi));

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  var status = err.status || 500;
  if (status >= 500) console.error(err);
  // Hide internal messages from clients unless in development.
  var message = status < 500 || req.app.get("env") === "development" ? err.message : "Internal Server Error";
  res.status(status).json({ error: { code: status === 404 ? "NOT_FOUND" : status < 500 ? "BAD_REQUEST" : "SERVER_ERROR", message: message } });
});

module.exports = app;
