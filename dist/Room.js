/// <reference path="../typings/tsd.d.ts" />
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var events = require('events');
var _ = require('lodash');
var Promise = require('bluebird');
var winston = require('winston');
var User = require('./User');
var Connection = require('./Connection');
var Message = require('./Message');
var util = require('./util');
var Room = (function (_super) {
    __extends(Room, _super);
    function Room(name, user) {
        var _this = this;
        if (user === void 0) { user = new User; }
        _super.call(this);
        this.owner = '';
        this.session_id = '';
        this.id = '';
        this.moderators = new util.Set();
        this.users = {};
        this._buffer = '';
        this._firstSend = true;
        this.name = name;
        this.user = user;
        this._connection = new Connection(this._getServer());
        this._connection.on('data', this._receiveData.bind(this));
        this._connection.on('close', this._reset.bind(this));
        this.on('error', function (err) {
            winston.log('error', err);
            _this._reset();
            throw err;
        });
    }
    Room.prototype.join = function () {
        var _this = this;
        winston.log('verbose', "Joining room " + this.name);
        return this._connection
            .connect()
            .then(function () {
            return new Promise(function (resolve, reject) {
                _this.once('init', resolve);
                _this._send("bauth:" + _this.name + ":" + _this.session_id + "::");
            })
                .timeout(Room.TIMEOUT);
        })
            .then(function () {
            return _this._authenticate();
        })
            .then(function () {
            return new Promise(function (resolve, reject) {
                _this.once('userlist', resolve);
                _this._send('gparticipants');
            })
                .timeout(Room.TIMEOUT);
        })
            .then(function () {
            if (!_this.user.hasInited) {
                return _this.user.init();
            }
        })
            .then(function () {
            if (_this.user.style.stylesOn) {
                _this._send('msgbg:1');
            }
        })
            .then(function () {
            winston.log('info', "Joined room " + _this.name);
            _this.emit('join', _this);
            return _this;
        })
            .timeout(Room.TIMEOUT);
    };
    Room.prototype.leave = function () {
        var _this = this;
        winston.log('verbose', "Leaving room " + this.name);
        return this._connection.disconnect()
            .then(function () {
            winston.log('info', "Left room " + _this.name);
            _this._reset();
            _this.emit('leave');
        });
    };
    Room.prototype._reset = function () {
        this._buffer = '';
        this._firstSend = true;
        this.users = {};
        return this;
    };
    Room.prototype.changeUser = function (new_user) {
        var _this = this;
        return this.leave().then(function () {
            _this.user = new_user;
            return _this.join();
        });
    };
    Room.prototype._send = function (command) {
        if (_.isArray(command)) {
            command = command.join(':');
        }
        winston.log('verbose', "Sending command to room " + this.name + ": \"" + command + "\"");
        if (!this._firstSend) {
            command += '\r\n';
        }
        this._firstSend = false;
        command += '\0';
        this._connection.send(command);
        return this;
    };
    Room.prototype.message = function (content) {
        content = _.escape(content);
        if (this.user.style.bold)
            content = "<b>" + content + "</b>";
        if (this.user.style.italics)
            content = "<i>" + content + "</i>";
        if (this.user.style.underline)
            content = "<u>" + content + "</u>";
        content.replace('\n', '<br/>');
        var _a = this.user.style, nameColor = _a.nameColor, fontSize = _a.fontSize, textColor = _a.textColor, fontFamily = _a.fontFamily;
        if (this.user.type === User.Type.Anonymous) {
            nameColor = String(this.server_time | 0).slice(-4);
        }
        var message = "<n" + nameColor + "/><f x" + fontSize + textColor + "=\"" + fontFamily + "\">" + content;
        this._send(['bm', Math.round(15e5 * Math.random()).toString(36), '0', message]);
        return this;
    };
    Room.prototype._authenticate = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            if (_this.user.type === User.Type.Anonymous)
                return resolve();
            if (_this.user.type === User.Type.Temporary)
                _this._send("blogin:" + _this.user.username);
            if (_this.user.type === User.Type.Registered)
                _this._send("blogin:" + _this.user.username + ":" + _this.user.password);
            _this.once('auth', resolve);
        })
            .timeout(Room.TIMEOUT)
            .then(function () {
            _this.users[_this.user.username] = _this.user;
        });
    };
    Room.prototype._handleCommand = function (command, args) {
        var _this = this;
        winston.log('debug', "Received <" + command + "> command from room " + this.name);
        switch (command) {
            case 'ok':
                (function () {
                    var owner = args[0], session_id = args[1], session_status = args[2], user_name = args[3], server_time = args[4], my_ip = args[5], moderators = args[6], server_id = args[7];
                    _this.owner = owner;
                    _this.session_id = session_id;
                    _this.id = server_id;
                    _this.server_time = parseFloat(server_id);
                    if (moderators) {
                        var mods = moderators.split(';');
                        for (var i = 0, len = mods.length; i < len; i++) {
                            var _a = mods[i].split(','), name = _a[0], permissions = _a[1];
                            _this.moderators.add(name);
                        }
                    }
                    if (_this.user.type === User.Type.Anonymous) {
                        _this.user.username = User.getAnonName("<n" + session_id.slice(4, 8) + "/>", (_this.server_time | 0).toString());
                    }
                })();
                break;
            case 'i':
                this.emit('history_message', this._parseMessage(args));
                break;
            case 'nomore':
                break;
            case 'inited':
                this.emit('init');
                break;
            case 'pwdok':
            case 'aliasok':
                winston.log('info', "Authenticated room " + this.name + " as user " + this.user.username);
                this.emit('auth');
                break;
            case 'n':
                this.here_now = parseInt(args[0], 16);
                break;
            case 'b':
                this.emit('message', this._parseMessage(args));
                break;
            case 'u':
                break;
            case 'mods':
                (function () {
                    var moderators = args[0];
                    var mods = moderators.split(';');
                    for (var i = 0, len = mods.length; i < len; i++) {
                        var _a = mods[i].split(','), name = _a[0], permissions = _a[1];
                        _this.moderators.add(name);
                    }
                })();
                break;
            case 'gparticipants':
                (function () {
                    var num_anon_or_temp_users = args[0], users = args.slice(1);
                    users = users.join(':').split(';');
                    for (var i = 0, len = users.length; i < len; i++) {
                        var _a = users[i].split(':'), dont_know = _a[0], joined_at = _a[1], session_id = _a[2], user_registered = _a[3], user_temporary = _a[4];
                        var name;
                        if (user_registered === 'None') {
                            name = user_temporary;
                        }
                        else {
                            name = user_registered;
                        }
                        var user;
                        if (name === _this.user.username) {
                            user = _this.user;
                        }
                        else {
                            user = new User(name, '', User.Type.Registered);
                            _this.users[user.username] = user;
                        }
                        user.session_ids.add(session_id);
                        user.joined_at = parseInt(joined_at, 10);
                    }
                    _this.emit('userlist', _this.users);
                })();
                break;
            case 'show_nlp':
                winston.log('warn', 'Could not send previous message due to spam detection.');
                this.emit('flood_ban_warning');
                break;
            case 'badalias':
                this.emit('error', new Error('Username is invalid or in use.'));
                break;
            case 'nlptb':
                winston.log('warn', "Flood banned in room " + this.name + " as " + this.user.username);
                this.emit('flood_ban');
                break;
            default:
                winston.log('warn', "Received command that has no handler from room " + this.name + ": <" + command + ">: " + args);
                break;
        }
    };
    Room.prototype._receiveData = function (data) {
        this._buffer += data;
        var commands = this._buffer.split('\0');
        if (commands[commands.length - 1] !== '') {
            this._buffer = commands.pop();
        }
        else {
            commands.pop();
            this._buffer = '';
        }
        winston.log('silly', "Received commands from room " + this.name + ": " + commands);
        for (var i = 0; i < commands.length; i++) {
            var _a = commands[i].split(':'), command = _a[0], args = _a.slice(1);
            this._handleCommand(command, args);
        }
    };
    Room.prototype._parseMessage = function (args) {
        var created_at = args[0], user_registered = args[1], user_temporary = args[2], user_session_id = args[3], user_id = args[4], message_id = args[5], user_ip = args[6], no_idea = args[7], no_idea_always_empty = args[8], raw_message = args.slice(9);
        var raw = raw_message.join(':');
        var name = user_registered || user_temporary;
        if (!name) {
            name = User.getAnonName(raw, user_session_id);
        }
        var message = Message.parse(raw);
        message.id = message_id;
        message.room = this;
        message.user = this.users[name] || name;
        message.created_at = parseInt(created_at, 10);
        return message;
    };
    Room.prototype._getServer = function (room_name) {
        if (room_name === void 0) { room_name = this.name; }
        var tsweights = [
            ['5', 75], ['6', 75], ['7', 75], ['8', 75], ['16', 75], ['17', 75], ['18', 75],
            ['9', 95], ['11', 95], ['12', 95], ['13', 95], ['14', 95], ['15', 95], ['19', 110],
            ['23', 110], ['24', 110], ['25', 110], ['26', 110], ['28', 104], ['29', 104], ['30', 104],
            ['31', 104], ['32', 104], ['33', 104], ['35', 101], ['36', 101], ['37', 101], ['38', 101],
            ['39', 101], ['40', 101], ['41', 101], ['42', 101], ['43', 101], ['44', 101], ['45', 101],
            ['46', 101], ['47', 101], ['48', 101], ['49', 101], ['50', 101], ['52', 110], ['53', 110],
            ['55', 110], ['57', 110], ['58', 110], ['59', 110], ['60', 110], ['61', 110], ['62', 110],
            ['63', 110], ['64', 110], ['65', 110], ['66', 110], ['68', 95], ['71', 116], ['72', 116],
            ['73', 116], ['74', 116], ['75', 116], ['76', 116], ['77', 116], ['78', 116], ['79', 116],
            ['80', 116], ['81', 116], ['82', 116], ['83', 116], ['84', 116]
        ];
        room_name = room_name.replace('_', 'q').replace('-', 'q');
        var fnv = parseInt(room_name.slice(0, _.min([room_name.length, 5])), 36);
        var lnv = room_name.slice(6, 6 + _.min([room_name.length - 5, 3]));
        if (lnv) {
            lnv = parseInt(lnv, 36);
            if (lnv < 1000)
                lnv = 1000;
        }
        else
            lnv = 1000;
        var num = (fnv % lnv) / lnv;
        var maxnum = _.sum(tsweights.map(function (n) { return n[1]; }));
        var cumfreq = 0;
        for (var i = 0; i < tsweights.length; i++) {
            var weight = tsweights[i];
            cumfreq += weight[1] / maxnum;
            if (num <= cumfreq) {
                return "s" + weight[0] + ".chatango.com";
            }
        }
        throw new Error("Couldn't find host server for room name " + room_name);
    };
    Room.TIMEOUT = 3000;
    return Room;
})(events.EventEmitter);
module.exports = Room;
