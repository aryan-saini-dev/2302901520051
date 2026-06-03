require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var Log = require('./Logging_middleware/logger');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var notificationsRouter = require('./routes/notifications');

var app = express();

app.use(logger('dev'));

// Log every request to AffordMed logging server
app.use(async (req, res, next) => {
  await Log('backend', 'info', 'route', `${req.method} ${req.originalUrl}`);
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());


app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/api/notifications', notificationsRouter);



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
