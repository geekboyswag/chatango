/// <reference path="../typings/tsd.d.ts" />
import fs = require('fs');
import request = require('request');
import Promise = require('bluebird');
import Message = require('./Message');
import util = require('./util');
declare class User {
    username: string;
    password: string;
    type: User.Type;
    joined_at: number;
    session_ids: util.Set<string>;
    style: Message.Style;
    background: Message.Background;
    hasInited: boolean;
    private _cookies;
    private static endpoint;
    endpoint_url: string;
    constructor(username?: string, password?: string, type?: User.Type);
    toString(): string;
    init(): Promise<any>;
    authenticate(): Promise<void>;
    getStyle(): Promise<Message.Style>;
    static getStyle(username: string): Promise<Message.Style>;
    setStyle(style?: Message.Style): Promise<Message.Style>;
    getBackground(): Promise<Message.Background>;
    static getBackground(username: string): Promise<Message.Background>;
    setBackground(background?: Message.Background): Promise<Message.Background>;
    setBackgroundImage(stream: fs.ReadStream): Promise<void>;
    getBackgroundImage(): request.Request;
    static getBackgroundImage(username: string): request.Request;
    getAvatar(): request.Request;
    static getAvatar(username: string): request.Request;
    static getAnonName(message: string, _id: string): string;
}
declare module User {
    enum Type {
        Anonymous = 0,
        Temporary = 1,
        Registered = 2,
    }
}
export = User;
