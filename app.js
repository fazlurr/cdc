// ==============================================
// CDC Institut Teknologi Indonesia
// ==============================================

// BASE SETUP
// ==============================================

var express = require('express');
var session = require('express-session'); // for storing session
var bodyParser = require('body-parser'); // for reading POSTed form data into `req.body`
var cookieParser = require('cookie-parser'); // the session is stored in a cookie, so we use this to parse it
var fs = require('fs');
var crypto = require('crypto');
var Q = require('Q');
var favicon = require('serve-favicon');
var logger = require('morgan');
var methodOverride = require('method-override');
var multer = require('multer');
var errorHandler = require('errorhandler');

var app = express();
var router = express.Router();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var path = require('path');

// Custom Settings Configuration
var config = {
	
	db: {
		host: 'localhost',
		user: 'root',
		password: '',
		database: 'cdc'
	},

	sessionOptions: {
		secret: 'doddyagung',
		resave: true,
		saveUninitialized: true
	}

};

var sessionMiddleware = session( config.sessionOptions );

// MySQL Connection
var mysql = require('mysql');
var connection = mysql.createConnection( config.db );

// create a write stream (in append mode)
var accessLogStream = fs.createWriteStream(__dirname + '/access.log', {flags: 'a'});

// ENVIRONMENT CONFIGURATION
// ==============================================

app.set('port', process.env.PORT || 3000);
app.set('env', 'development');
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(favicon(__dirname + '/public/favicon.ico'));

// setup the logger
app.use(logger('dev'));

app.use(methodOverride());
app.use(multer({
	dest: './public/uploads/',
	rename: function (fieldname, filename) {
		return filename.replace(/\W+/g, '-').toLowerCase() + '-' + Date.now();
	}
}));

app.use(cookieParser()); // must use cookieParser before expressSession

// Sessions
io.use(function(socket, next) {
	sessionMiddleware(socket.request, socket.request.res, next);
});

app.use(sessionMiddleware);

app.use(bodyParser.json()); // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // to support URL-encoded bodies

app.use(express.static(path.join(__dirname, 'public'))); // Serving static files in public folder

app.use(express.static(path.join(__dirname, 'uploads'))); // Serving static files in uploads folder

app.set('title', 'Career Development Center - ITI');

// Connect to MySQL 
connection.connect();

// Helpers
// ==============================================
app.locals.uploadDir = '/uploads/';
app.locals.stringToDate = function(text) {
	var monthNames = [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" ];
	var date = new Date(text);
	text = date.getDate() + ' ' + monthNames[ date.getMonth() ] + ' ' + date.getFullYear();
  return (text);
};

app.locals.stringToSimpleDate = function(text) {
	var monthNames = [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" ];
	var date = new Date(text);
	text = monthNames[ date.getMonth() ] + ' ' + date.getDate() + ', ' + date.getFullYear();
  return (text);
};

// CUSTOM FUNCTIONS
// ==============================================

var Helper = {

	allowedUrls: [ '/', '/login', '/cdc', '/profile', '/ts-statistics', '/gallery' ],

	notAllowedUrls: [ '/dashboard', '/ts-form' ],

	inArray: function (needle, haystack) {
		
		var length = haystack.length;

		for(var i = 0; i < length; i++) {
			if(haystack[i] == needle) return true;
		}

		return false;

	}

};

var User = {

	TAG_LOGIN: 'LOGIN',

	TAG_LOGOUT: 'LOGOUT',

	// Check Session for every request
	checkSession: function (req, res, next) {

		var isNotAllowed = Helper.inArray(req.url, Helper.notAllowedUrls);

		console.log('isNotAllowed : ' + isNotAllowed);

		if ( isNotAllowed ) {
			// if user go to page except register THEN check if user authenticated
			if ( req.url == '/register' || req.session.user) {
				return next();
			}
			// IF USER ISN'T LOGGED IN, REDIRECT THEM TO LOGIN PAGE
			res.redirect('/login');
		}
		else if (req.url == '/login') {
			// If user go to login page and had already authenticated, redirect the user to home page
			if (req.session.user) {
				res.redirect('/');
			}
			else {
				return next();
			}
		}
		// continue doing what we were doing and go to the route
		next();
	},

	authenticate: function (user_email, user_password, callback) {

		var queryGetUser = "SELECT * FROM user WHERE email='" + user_email + "' AND password = MD5('" + user_password + "');";

		connection.query(queryGetUser, function(err, rows, fields) {
			if (err) throw err;

			if (rows.length == 1) {
				
				var currentUser = rows[0];

				console.log(User.TAG_LOGIN + ' User with id : ' + currentUser.id + ' (' + currentUser.first_name + ') is logged in');

				callback(currentUser);

			}

			else {
				callback(null);
			}

		});

	},

	register: function (req, res, userData) {

		var query = connection.query('INSERT INTO user SET ?', userData, function(err, result) {
			if (err) throw err;

			console.log("Result : " + result.insertId);

			userData.id = result.insertId;

			req.session.user = userData;

			res.redirect('/');
		});

	},

	getAllUsers: function (callback) {

		var allUsers = '';

		var queryGetAllUsers = 'SELECT * FROM user';

		connection.query(queryGetAllUsers, function (err, rows, fields) {
			if (err) throw err;

			allUsers = rows;

			jsonAllUsers = JSON.stringify(allUsers);

			callback(null, jsonAllUsers);
		});

	},

	getUser: function (userId, callback) {

		var queryGetUser = 'SELECT user.first_name, user.email, user.dob, user.last_name, user.class_of, user.phone, user.address, program.name AS program_name FROM user LEFT JOIN program ON program.id = user.program_id WHERE user.id = ?';

		connection.query(queryGetUser, userId, function (err, rows, fields) {
			if (err) throw err;
			var user = rows[0];
			callback(null, user);
		});

	}

};

var CDC = {

	insertPost: function (post, callback) {

		var query = connection.query('INSERT INTO post SET ?', post, function (err, result) {
			if (err) throw err;
			callback(err, result);
		});

	},

	getAllPosts: function (callback) {

		var allPosts = '';

		var	queryGetAllPosts = 'SELECT post.*, user.first_name, user.last_name, post_category.name AS category_name FROM post, user, post_category WHERE user.id = user_id AND post_category.id = post_category_id ORDER BY post.id DESC';

		connection.query(queryGetAllPosts, function(err, rows, fields) {
			if (err) throw err;

			allPosts = {
				posts: rows
			};

			jsonAllPosts = JSON.stringify(allPosts);

			callback(null, jsonAllPosts);
		});

	}

};

var TracerStudy = {

	allProgramsCode: ["IF", "TS", "TK", "TA", "PWK", "TE", "TM", "TIP", "TI", "MT", "OT", "MJ"],

	allPrograms: ["Informatika","Teknik Sipil", "Teknik Kimia", "Teknik Arsitektur", "Perancangan Wilayah dan Kota", "Teknik Elektro", "Teknik Mesin", "Teknik Industri Pertanian", "Teknik Industri", "Mekatronika", "Otomotif", "Manajemen"],

	allClasses: [2005,2006,2007,2008,2009,2010,2011,2012,2013,2014],

	fieldsOfWork: ['Manufaktur', 'Industri Kimia', 'Industri Makanan', 'Industri Tekstil', 'Perbankan', 'Keuangan', 'Jasa', 'Konsultan Teknik', 'Marketing', 'Pendidikan', 'Lainnya'],

	relations: ['Sesuai', 'Masih ada kaitannya', 'Tidak ada kaitannya'],

	check: function (user_id, callback) {

		var queryGetAnswer = "SELECT user_id FROM answer WHERE user_id = '" + user_id + "'";

		connection.query(queryGetAnswer, function(err, rows, fields) {
			if (err) throw err;

			var isUserHadFillTheForm = false;

			if (rows.length !== 0) {
				isUserHadFillTheForm = true;
			}

			console.log(rows);

			callback(null, isUserHadFillTheForm);
		});

	},

	insert: function (answer, callback) {

		var query = connection.query('INSERT INTO answer SET ?', answer, function(err, result) {
			if (err) throw err;

			var msg = 'new ts post';

			io.emit('ts post', msg);

			callback(err, result);
		});

	},

	getAllRespondenTotal: function(callback) {

		var allData = [];

		var allPrograms = TracerStudy.allPrograms;

		var allProgramsCode = TracerStudy.allProgramsCode;
		
		var	index = 1;

		allPrograms.forEach(function(theProgram) {
			var deferred = Q.defer();

			function finishedQuery(result) {
				deferred.resolve(result);
			}

			TracerStudy.getRespondenTotalByProgram(index, finishedQuery);

			allData.push(deferred.promise);

			index++;
		});
		
		return Q.all(allData).then(function () { return callback(allData); });

	},

	getRespondenTotalByProgram: function(programId, callback) {

		var allProgramsCode = TracerStudy.allProgramsCode;

		function finishedQuery(err, rows, fields) {
			if (err) throw err;

			var responden = {
				name: allProgramsCode[programId - 1],
				data: [ rows[0].total_responden ]
			};

			callback(responden);
		}

		var queryGetPercentage = "SELECT COUNT(answer.user_id) AS total_responden FROM answer LEFT JOIN user ON user.id = answer.user_id WHERE user.program_id = '" + programId + "'";

		connection.query(queryGetPercentage, finishedQuery);

	},

	getAllWorkPercentage: function(callback) {

		var allData = [];

		var allPrograms = TracerStudy.allPrograms;
		
		var	index = 1;

		allPrograms.forEach(function(theProgram) {
			var deferred = Q.defer();

			function finishedQuery(result) {
				// console.log("Result : " + result);
				deferred.resolve(result);
			}

			TracerStudy.getWorkPercentageByProgram(index, finishedQuery);

			allData.push(deferred.promise);

			index++;
		});
		
		return Q.all(allData).then(function () { return callback(allData); });

	},

	getWorkPercentageByProgram: function(programId, callback) {

		var allProgramsCode = TracerStudy.allProgramsCode;

		var allPrograms = TracerStudy.allPrograms;

		var allClasses = TracerStudy.allClasses;

		var allPercentage = {

			name: allProgramsCode[programId - 1],

			data: []

		};

		allClasses.forEach( function (theClass) {
			var deferred = Q.defer();

			function finishedQuery(err, rows, fields) {
				if (err) throw err;

				allPosts = rows;

				var Program = {};
				
				var percentage = rows[0].percentage;

				Program.id = programId;
				Program.name = rows[0].name;
				Program.classOf = theClass;
				Program.percentage = percentage;

				var programJSON = JSON.stringify(Program);

				// console.log('Program : ' + programJSON);

				deferred.resolve(percentage);
			}

			// console.log('The Class : ' + theClass);

			var queryGetPercentage = "SELECT COUNT(answer.user_id) AS has_worked, ( COUNT(answer.user_id) / (SELECT COUNT(answer.user_id) FROM answer LEFT JOIN user ON user.id = answer.user_id WHERE user.program_id = '" + programId + "' AND user.class_of = '" + theClass + "' ) ) * 100 as percentage, user.class_of, program.name FROM answer LEFT JOIN user ON user.id = answer.user_id LEFT JOIN program ON program.id = user.program_id WHERE answer.status_id = '1' AND user.program_id = '" + programId + "' AND user.class_of = '" + theClass + "'";

			connection.query(queryGetPercentage, finishedQuery);

			allPercentage.data.push(deferred.promise);
		});
		
		return Q.all(allPercentage.data).then(function () { return callback(allPercentage); });

	},

	getWorkPercentageByProgramAndClass: function(programId, classOf, callback) {

		var queryGetPercentage = "SELECT COUNT(answer.user_id) AS has_worked, ( COUNT(answer.user_id) / (SELECT COUNT(answer.user_id) FROM answer LEFT JOIN user ON user.id = answer.user_id WHERE user.program_id = '" + programId + "' AND user.class_of = '" + classOf + "' ) ) * 100 as percentage, user.class_of, program.name FROM answer LEFT JOIN user ON user.id = answer.user_id LEFT JOIN program ON program.id = user.program_id WHERE answer.status_id = '1' AND user.program_id = '" + programId + "' AND user.class_of = '" + classOf + "'";

		function finishedQuery(err, rows, fields) {
			if (err) throw err;

			var program = {};

			program.name = TracerStudy.allProgramsCode[ programId - 1 ];
			program.data = rows[0].percentage;

			callback(program);
		}

		function addToAllPercentage(values) {
			allPercentage.push(values);
			callback(allPercentage);
		}

		connection.query(queryGetPercentage, finishedQuery);

	},

	getAllWorkTotal: function(callback) {

		var allData = [];

		var allPrograms = TracerStudy.allPrograms;
		
		var	index = 1;

		allPrograms.forEach(function(theProgram) {
			var deferred = Q.defer();

			function finishedQuery(result) {
				// console.log("Result : " + result);
				deferred.resolve(result);
			}

			// console.log("Index : " + index);

			TracerStudy.getWorkTotalByProgram(index, finishedQuery);

			allData.push(deferred.promise);

			index++;
		});
		
		return Q.all(allData).then(function () { return callback(allData); });

	},

	getWorkTotalByProgram: function(programId, callback) {

		var allProgramsCode = TracerStudy.allProgramsCode;

		var allPrograms = TracerStudy.allPrograms;

		var allClasses = TracerStudy.allClasses;

		var allTotal = {

			name: allProgramsCode[programId - 1],

			data: []

		};

		allClasses.forEach( function (theClass) {
			var deferred = Q.defer();

			function finishedQuery (err, rows, fields) {
				if (err) throw err;

				var Program = {};
				
				var total = rows[0].total;

				Program.id = programId;
				Program.name = rows[0].program_name;
				Program.classOf = theClass;
				Program.total = total;

				var programJSON = JSON.stringify(Program);

				// console.log(rows);

				deferred.resolve(total);
			}

			// console.log('The Class : ' + theClass);

			var queryGetTotal = "SELECT COUNT(answer.user_id) AS total, user.class_of, program.name AS program_name FROM answer LEFT JOIN user ON user.id = answer.user_id LEFT JOIN program ON program.id = user.program_id WHERE answer.status_id = '1' AND user.program_id = '" + programId + "' AND user.class_of = '" + theClass + "'";

			connection.query(queryGetTotal, finishedQuery);

			allTotal.data.push(deferred.promise);
		});
		
		return Q.all(allTotal.data).then(function () { return callback(allTotal); });

	},

	getWorkTotalByProgramAndClass: function(programId, classOf, callback) {

		var allProgramsCode = TracerStudy.allProgramsCode;

		var allPrograms = TracerStudy.allPrograms;

		var queryGetTotal = "SELECT COUNT(answer.user_id) AS total, user.class_of, program.name FROM answer LEFT JOIN user ON user.id = answer.user_id LEFT JOIN program ON program.id = user.program_id WHERE answer.status_id = '1' AND user.program_id = '" + programId + "' AND user.class_of = '" + classOf + "'";

		function finishedQuery(err, rows, fields) {
			if (err) throw err;

			var program = {};

			// program.name = rows[0].name;
			program.name = allProgramsCode[ programId - 1 ];
			program.data = rows[0].total;

			callback(program);
		}

		function addToAllTotal(values) {
			allTotal.push(values);
			callback(allTotal);
		}

		connection.query(queryGetTotal, finishedQuery);

	},

	getAllSalaryPercentage: function(callback) {

		var queryGetTotal = "SELECT answer.gaji_id, COUNT(answer.id) AS total FROM answer WHERE answer.status_id = 1 GROUP BY answer.gaji_id";

		function finishedQuery(err, rows, fields) {
			if (err) throw err;

			var totalAlumni = 0;

			for (var j in rows) {
				totalAlumni += rows[j].total;
			}

			var allDataGaji = [];

			for (var i in rows) {
				var gaji = rows[i];

				var dataGaji = {};

				switch ( gaji.gaji_id ) {
					case 1:
						dataGaji.name = '500rb - 1 juta';
						break;
					case 2:
						dataGaji.name = '1 juta - 2 juta';
						break;
					case 3:
						dataGaji.name = '2 juta - 3 juta';
						break;
					case 4:
						dataGaji.name = '3 juta - 5 juta';
						break;
					case 5:
						dataGaji.name = 'Diatas 5 juta';
						break;
				}

				var persentase = ( gaji.total / totalAlumni ) * 100;

				dataGaji.y = persentase;

				allDataGaji.push(dataGaji);
			}

			callback(allDataGaji);
		}

		connection.query(queryGetTotal, finishedQuery);

	},

	getAllSalaryTotal: function(callback) {

		var queryGetTotal = "SELECT answer.gaji_id, COUNT(answer.id) AS total FROM answer WHERE answer.status_id = 1 GROUP BY answer.gaji_id";

		function finishedQuery(err, rows, fields) {
			if (err) throw err;

			var totalAlumni = 0;

			for (var j in rows) {
				totalAlumni += rows[j].total;
			}

			var allDataGaji = [];

			for (var i in rows) {
				var gaji = rows[i];

				var dataGaji = {};

				switch ( gaji.gaji_id ) {
					case 1:
						dataGaji.name = '500rb - 1 juta';
						break;
					case 2:
						dataGaji.name = '1 juta - 2 juta';
						break;
					case 3:
						dataGaji.name = '2 juta - 3 juta';
						break;
					case 4:
						dataGaji.name = '3 juta - 5 juta';
						break;
					case 5:
						dataGaji.name = 'Diatas 5 juta';
						break;
				}

				dataGaji.data = [gaji.total];

				allDataGaji.push(dataGaji);
			}

			callback(allDataGaji);
		}

		connection.query(queryGetTotal, finishedQuery);

	},

	getAllFieldOfWorkPercentage: function(callback) {

		var allData = [];

		var fieldsOfWork = TracerStudy.fieldsOfWork;
		
		var	index = 1;

		fieldsOfWork.forEach(function(theWork) {
			var deferred = Q.defer();

			function finishedQuery(result) {
				deferred.resolve(result);
			}

			TracerStudy.getFieldOfWorkPercentageById(index, finishedQuery);

			allData.push(deferred.promise);

			index++;
		});
		
		return Q.all(allData).then(function () { return callback(allData); });

	},

	getFieldOfWorkPercentageById: function(fowId, callback) {

		var fieldsOfWork = TracerStudy.fieldsOfWork;

		function finishedQuery(err, rows, fields) {
			if (err) throw err;

			var fow = {
				name: fieldsOfWork[fowId - 1],
				y: rows[0].total
			};

			callback(fow);
		}

		var query = "SELECT COUNT(answer.id) AS total FROM answer WHERE answer.perusahaan_bidang_id = '" + fowId + "'";

		connection.query(query, finishedQuery);

	},

	getAllFieldOfWorkTotal: function(callback) {

		var allData = [];

		var fieldsOfWork = TracerStudy.fieldsOfWork;
		
		var	index = 1;

		fieldsOfWork.forEach(function(theWork) {
			var deferred = Q.defer();

			function finishedQuery(result) {
				deferred.resolve(result);
			}

			TracerStudy.getFieldOfWorkTotalById(index, finishedQuery);

			allData.push(deferred.promise);

			index++;
		});
		
		return Q.all(allData).then(function () { return callback(allData); });

	},

	getFieldOfWorkTotalById: function(fowId, callback) {

		var fieldsOfWork = TracerStudy.fieldsOfWork;

		function finishedQuery(err, rows, fields) {
			if (err) throw err;

			var fow = {
				name: fieldsOfWork[fowId - 1],
				data: [ rows[0].total ]
			};

			callback(fow);
		}

		var query = "SELECT COUNT(answer.id) AS total FROM answer WHERE answer.perusahaan_bidang_id = '" + fowId + "'";

		connection.query(query, finishedQuery);

	},

	getAllRelationPercentage: function(callback) {

		var allData = [];

		var relations = TracerStudy.relations;
		
		var	index = 1;

		relations.forEach(function(theWork) {
			var deferred = Q.defer();

			function finishedQuery(result) {
				deferred.resolve(result);
			}

			TracerStudy.getRelationPercentageById(index, finishedQuery);

			allData.push(deferred.promise);

			index++;
		});
		
		return Q.all(allData).then(function () { return callback(allData); });

	},

	getRelationPercentageById: function(relationId, callback) {

		var relations = TracerStudy.relations;

		function finishedQuery(err, rows, fields) {
			if (err) throw err;

			var fow = {
				name: relations[relationId - 1],
				y: rows[0].total
			};

			callback(fow);
		}

		var query = "SELECT COUNT(answer.id) AS total FROM answer WHERE answer.kecocokan_id = '" + relationId + "'";

		connection.query(query, finishedQuery);

	},

	getAllRelationTotal: function(callback) {

		var allData = [];

		var relations = TracerStudy.relations;
		
		var	index = 1;

		relations.forEach(function(theWork) {
			var deferred = Q.defer();

			function finishedQuery(result) {
				deferred.resolve(result);
			}

			TracerStudy.getRelationTotalById(index, finishedQuery);

			allData.push(deferred.promise);

			index++;
		});
		
		return Q.all(allData).then(function () { return callback(allData); });

	},

	getRelationTotalById: function(relationId, callback) {

		var relations = TracerStudy.relations;

		function finishedQuery(err, rows, fields) {
			if (err) throw err;

			var relation = {
				name: relations[relationId - 1],
				data: [ rows[0].total ]
			};

			callback(relation);
		}

		var query = "SELECT COUNT(answer.id) AS total FROM answer WHERE answer.kecocokan_id = '" + relationId + "'";

		connection.query(query, finishedQuery);

	},
};

var Gallery = {

	insert: function (gallery, callback) {

		var query = connection.query('INSERT INTO gallery SET ?', gallery, function(err, result) {
			if (err) throw err;
			callback(err, result);
		});

	},

	getAllGallery: function (callback) {

		var	queryGetAllPosts = 'SELECT * FROM gallery';

		connection.query(queryGetAllPosts, function(err, rows, fields) {
			if (err) throw err;

			allGalleries = {
				galleries: rows
			};

			callback(allGalleries);
		});

	}

};

var News = {

	TABLE_NAME: 'news',

	insert: function (news, callback) {

		var query = connection.query('INSERT INTO news SET ?', news, function(err, result) {
			if (err) throw err;
			callback(err, result);
		});

	},

	getLatestNews: function (callback) {

		var queryGetAllNews = 'SELECT * FROM ' + News.TABLE_NAME + ' ORDER BY id DESC LIMIT 4';

		connection.query(queryGetAllNews, function (err, rows, fields) {
			if (err) throw err;

			var jsonAllNews = JSON.stringify(rows);

			callback(jsonAllNews);
		});

	},

	getById: function (id, callback) {

		var queryGetEvent = 'SELECT * FROM ' + News.TABLE_NAME + ' WHERE id = ?';

		connection.query(queryGetEvent, id, function(err, rows, fields) {
			if (err) throw err;

			callback(rows[0]);
		});

	}

};

var Event = {

	TABLE_NAME: 'event',

	insert: function (theEvent, callback) {

		var query = connection.query('INSERT INTO event SET ?', theEvent, function(err, result) {
			if (err) throw err;
			callback(err, result);
		});

	},

	getRecentEvents: function (callback) {

		var queryGetAllEvents = 'SELECT * FROM ' + Event.TABLE_NAME + ' ORDER BY id DESC LIMIT 4';

		connection.query(queryGetAllEvents, function (err, rows, fields) {
			if (err) throw err;

			var jsonAllEvents = JSON.stringify(rows);

			callback(jsonAllEvents);
		});

	},

	getById: function (id, callback) {

		var queryGetEvent = 'SELECT * FROM ' + Event.TABLE_NAME + ' WHERE id = ?';

		connection.query(queryGetEvent, id, function(err, rows, fields) {
			if (err) throw err;

			callback(rows[0]);
		});

	}

};

var Dashboard = {

	getAllInformation: function (callback) {

		var queryGetAnswer = "SELECT ( SELECT information.profile FROM information WHERE id = '1' ) as profile, ( SELECT COUNT(user.id) FROM user ) AS total_user, ( SELECT COUNT(answer.id) FROM answer ) AS total_answer, ( SELECT COUNT(answer.id) FROM answer WHERE status_id = '1' ) AS total_answer_work, ( SELECT COUNT(answer.id) FROM answer WHERE status_id = '2' ) AS total_answer_not_work, ( SELECT COUNT(post.id) FROM post ) AS total_post, ( SELECT COUNT(gallery.id) FROM gallery ) AS total_gallery";

		connection.query(queryGetAnswer, function(err, rows, fields) {
			if (err) throw err;

			callback(rows[0]);
		});

	},

	updateInformation: function (information, callback) {

		var queryUpdateInformation = "UPDATE information SET profile = ?";

		connection.query(queryUpdateInformation, information, function (err, result) {
			if (err) throw err;
			callback('profile updated');
		});

	}

};

// MIDDLEWARES
// ==============================================

// route middleware that will happen on every request
router.use(User.checkSession);

// ROUTES
// ==============================================

// REST API
// ----------------------------------------------

// Information
router.post('/api/information', function (req, res) {
	function responseResult (result) {
		console.log(result);
		res.redirect('/dashboard');
	}

	var information = {
		id: 1,
		profile: req.body.profile
	};

	Dashboard.updateInformation(information, responseResult);
});

// User
router.get('/api/user', function (req, res) {
	function responseResult (err, result) {
		res.send(result);
	}

	User.getAllUsers(responseResult);
});

// CDC
router.get('/api/cdc', function (req, res) {
	CDC.getAllPosts( function (err, result) {
		res.send(result);
	});
});

// Tracer Study
router.get('/api/ts', function (req, res) {
	function responseResult (result) {
		res.json(result);
	}

	Dashboard.getAllInformation(responseResult);
});

router.post('/api/ts', function (req, res) {
	var answer = {}; // object

	answer.user_id						= req.session.user.id;
	answer.bekerja_studi				= req.body.bekerja_studi;
	answer.jenis_bekerja_studi_id		= req.body.jenis_bekerja_studi;
	answer.status_id					= req.body.status;
	answer.cari_aktif					= req.body.cari_aktif;
	answer.cari_informasi_id			= req.body.cari_informasi;
	answer.cari_jenis_id				= req.body.cari_jenis;
	answer.nama_perusahaan				= req.body.nama_perusahaan;
	answer.lama_menunggu				= req.body.lama_menunggu;
	answer.lama_bekerja					= req.body.lama_bekerja;
	answer.perusahaan_pribadi			= req.body.perusahaan_pribadi;
	answer.perusahaan_kepemilikan_id	= req.body.perusahaan_kepemilikan;
	answer.perusahaan_bidang_id			= req.body.perusahaan_bidang;
	answer.gaji_id						= req.body.gaji;
	answer.kecocokan_id					= req.body.kecocokan;
	answer.pekerjaan					= req.body.pekerjaan;
	answer.alamat_pekerjaan				= req.body.alamat_pekerjaan;
	answer.manfaat						= req.body.manfaat;
	answer.masukan						= req.body.masukan;
	answer.saran						= req.body.saran;

	function responseResult (err, result) {
		res.send('success');
	}

	TracerStudy.insert(answer, responseResult);
});

router.get('/api/ts/check', function (req, res) {
	var user_id = req.session.user.id;

	TracerStudy.check(user_id, function(err, result) {
		res.send(result);
	});
});

// Tracer Study - Responden Total
router.get('/api/ts/responden/total', function (req, res) {

	function responseResult (result) { res.json(result); }

	TracerStudy.getAllRespondenTotal(responseResult);
});

router.get('/api/ts/responden/total/:programId', function (req, res) {
	var programId = req.params.programId;

	function responseResult (result) { res.json(result); }

	TracerStudy.getRespondenTotalByProgram(programId, responseResult);
});

// Tracer Study - Work Percentage
router.get('/api/ts/work/percentage', function (req, res) {

	function responseResult (result) { res.json(result); }

	TracerStudy.getAllWorkPercentage(responseResult);
});

router.get('/api/ts/work/percentage/:programId', function (req, res) {
	var programId = req.params.programId;

	function responseResult (result) { res.json(result); }

	TracerStudy.getWorkPercentageByProgram(programId, responseResult);
});

router.get('/api/ts/work/percentage/:programId/:classOf', function (req, res) {
	var programId = req.params.programId;
	var classOf = req.params.classOf;

	function responseResult (result) { res.json(result); }

	TracerStudy.getWorkPercentageByProgramAndClass(programId, classOf, responseResult);
});

// Tracer Study - Work Total
router.get('/api/ts/work/total', function (req, res) {

	function responseResult (result) { res.json(result); }

	TracerStudy.getAllWorkTotal(responseResult);
});

router.get('/api/ts/work/total/:programId', function (req, res) {
	var programId = req.params.programId;

	function responseResult (result) { res.json(result); }

	TracerStudy.getWorkTotalByProgram(programId, responseResult);
});

router.get('/api/ts/work/total/:programId/:classOf', function (req, res) {
	var programId = req.params.programId;
	var classOf = req.params.classOf;

	function responseResult (result) { res.json(result); }

	TracerStudy.getWorkTotalByProgramAndClass(programId, classOf, responseResult);
});

// Tracer Study - Salary Percentage
router.get('/api/ts/salary/percentage', function (req, res) {

	function responseResult (result) { res.json(result); }

	TracerStudy.getAllSalaryPercentage(responseResult);

});

// Tracer Study - Salary Total
router.get('/api/ts/salary/total', function (req, res) {

	function responseResult (result) { res.json(result); }

	TracerStudy.getAllSalaryTotal(responseResult);

});

// Tracer Study - Field of Work Percentage
router.get('/api/ts/fow/percentage', function (req, res) {

	function responseResult (result) { res.json(result); }

	TracerStudy.getAllFieldOfWorkPercentage(responseResult);

});

// Tracer Study - Field of Work Total
router.get('/api/ts/fow/total', function (req, res) {

	function responseResult (result) { res.json(result); }

	TracerStudy.getAllFieldOfWorkTotal(responseResult);

});

// Tracer Study - Relation between work and study Percentage
router.get('/api/ts/relation/percentage', function (req, res) {

	function responseResult (result) { res.json(result); }

	TracerStudy.getAllRelationPercentage(responseResult);

});

// Tracer Study - Relation between work and study Total
router.get('/api/ts/relation/total', function (req, res) {

	function responseResult (result) { res.json(result); }

	TracerStudy.getAllRelationTotal(responseResult);

});

// Gallery
router.get('/api/gallery', function (req, res) {

	function responseResult (result) { res.json(result); }

	Gallery.getAllGallery(responseResult);

});

router.post('/api/gallery', function (req, res) {

	var gallery = {
		user_id: req.session.user.id,
		image: req.files.image.name,
		description: req.body.description
	};

	function responseResult (result) {
		console.log(result);
		res.redirect('/dashboard');
	}

	Gallery.insert(gallery, responseResult);

});

// News
router.post('/api/news', function (req, res) {

	function responseResult (result) {
		res.redirect('/dashboard');
	}

	var news = {
		title: req.body.title,
		content: req.body.content,
		image: req.files.image.name
	};

	News.insert(news, responseResult);

});

router.get('/api/news', function (req, res) {

	function responseResult (result) { res.json(result); }

	News.getLatestNews(responseResult);

});

// Event
router.post('/api/event', function (req, res) {

	function responseResult (result) {
		res.redirect('/dashboard');
	}

	var theEvent = {
		name: req.body.name,
		date: req.body.date,
		description: req.body.description,
		image: req.files.image.name
	};

	Event.insert(theEvent, responseResult);

});

router.get('/api/event', function (req, res) {

	function responseResult (result) { res.json(result); }

	Event.getRecentEvents(responseResult);

});

// UI
// ----------------------------------------------

router.get('/', function (req, res) {
	var data = { user: req.session.user };
	res.render('index', data);
});

router.get('/dashboard', function (req, res) {

	function responseResult(result) {
		result.user = req.session.user;
		res.render('dashboard', result);
	}

	if (req.session.user.type == 'admin') {
		Dashboard.getAllInformation(responseResult);
	}

	else {

		var error = {
			message: "You don't have permissions to access this page",
			error: {
				status: '',
				stack: ''
			}
		};

		res.render('error', error);
	}
	
});

router.get('/user/:id', function (req, res) {
	var userId = req.params.id;

	function responseResult(err, result) {
		result.user = req.session.user;
		res.render('user', result);
	}

	User.getUser(userId, responseResult);
});

router.get('/news/:id', function (req, res) {
	var newsId = req.params.id;

	function responseResult(result) {
		console.log('News : ' + result);
		result.user = req.session.user;
		res.render('news', result);
	}

	News.getById(newsId, responseResult);
});

router.get('/event/:id', function (req, res) {
	var eventId = req.params.id;

	function responseResult(result) {
		console.log('Event : ' + result.name);
		result.user = req.session.user;
		res.render('event', result);
	}

	Event.getById(eventId, responseResult);
});

router.get('/cdc', function (req, res) {
	var data = { user: req.session.user };
	res.render('cdc', data);
});

router.get('/ts-form', function (req, res) {
	var data = { user: req.session.user };
	res.render('ts-form', data);
});

router.get('/ts-statistics', function (req, res) {
	var data = { user: req.session.user };
	res.render('ts-statistics', data);
});

router.get('/gallery', function (req, res) {
	function responseResult (result) {
		result.user = req.session.user;
		res.render('gallery', result);
	}

	Gallery.getAllGallery(responseResult);
});

router.get('/profile', function (req, res) {
	function responseResult(result) {
		result.user = req.session.user;
		res.render('profile', result);
	}

	Dashboard.getAllInformation(responseResult);
});

router.get('/faq', function (req, res) {
	var data = {
		user: req.session.user
	};
	res.render('faq', data);
});

router.get('/login', function (req, res) {
	var data = {
		user: req.session.user
	};
	res.render('login', data);
});

router.post('/login', function (req, res) {
	var user_email = req.body.user_email,
		user_password = req.body.user_password;

	function responseResult (user) {
		if (user) {
			req.session.user = user;
		}
		res.redirect('/');
	}

	User.authenticate(user_email, user_password, responseResult);
});

router.get('/register', function (req, res) {
	res.render('register');
});

router.post('/register', function (req, res) {
	console.log(req.body.user_email + req.body.user_password);

	var userData = {};

	var hashedPassword = crypto.createHash('md5').update(req.body.user_password).digest('hex');

	userData.email = req.body.user_email;
	userData.password = hashedPassword;
	userData.first_name = req.body.user_first_name;
	userData.last_name = req.body.user_last_name;
	userData.dob = req.body.user_dob;
	userData.phone = req.body.user_phone;
	userData.address = req.body.user_address;
	userData.program_id = req.body.user_program_id;
	userData.class_of = req.body.user_class_of;
	userData.type = "user";

	User.register(req, res, userData);
});

router.get('/logout', function (req, res) {
	var currentUser = req.session.user;

	console.log(User.TAG_LOGOUT + ' User with id : ' + currentUser.id + ' (' + currentUser.first_name + ') is logged out');
	
	req.session.user = null;
	res.redirect('/login');
});

app.use('/', router);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
});

// error handling middleware should be loaded after the loading the routes
if ('development' == app.get('env')) {
	app.use(errorHandler());
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
	res.status(err.status || 500);
	res.render('error', {
		message: err.message,
		error: {}
	});
});

// Socket IO
// ==============================================

io.on('connection', function (socket) {
	var currentUser = socket.request.session.user;

	socket.on('cdc post', function (msg) {
		msg.user_id = currentUser.id;

		function responseResult(err, result) {
			msg.id = result.insertId;
			msg.user = currentUser;
			io.emit('cdc post', msg);
		}

		CDC.insertPost(msg, responseResult);
	});

	
});

// START THE SERVER
// ==============================================

var server = http.listen(app.get('port'), function () {

  var host = server.address().address;
  var port = server.address().port;

  console.log('CDC ITI listening at http://%s:%s', host, port);

});