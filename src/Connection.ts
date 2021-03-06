/// <reference path="../typings/tsd.d.ts" />

import events = require('events');
import net = require('net');
import winston = require('winston');
import Promise = require('bluebird');

class Connection extends events.EventEmitter {
  socket: net.Socket;
  connected: boolean = false;
  auto_reconnect: boolean = false;
  
  host: string;
  port: number;

  get address(): string {
    return `${this.host}:${this.port}`;
  }

  private static TIMEOUT = 3000;

  constructor(host: string, port: number = 443) {
    super();

    this.host = host;
    this.port = port;

    this.socket = new net.Socket({
      readable: true,
      writeable: true,
    });

    this.socket.setEncoding('utf8');

    this.socket.on('connect', () => {
      this.connected = true;
      winston.log('info', `Connected to ${this.address}`);
      this.emit('connect');
    });

    this.socket.on('data', (data: string) => {
      winston.log('silly', `Received data: "${data}"`);
      this.emit('data', data);
    });

    this.socket.on('end', () => {
      winston.log('debug', `Received FIN packet from ${this.address}`);
      this.emit('end');
    });

    this.socket.on('timeout', () => {
      winston.log('warn', `${this.address} timeout`);
      this.emit('timeout');
    });

    this.socket.on('drain', () => {
      this.emit('drain');
    });

    this.socket.on('error', (err: Error) => {
      winston.log('error', `Error on connection to ${this.address}: ${err}`);
      this.auto_reconnect = false;
      this.emit('error', err);
    });

    this.socket.on('close', (had_error: boolean) => {
      this.connected = false;
      winston.log('info', `Connection to ${this.address} closed`);
      this.emit('close', had_error);
      if (this.auto_reconnect) {
        winston.log('info', `Attempting to reconnect to ${this.address}`);
        this.connect();
      }
    });
  }

  connect(port: number = this.port): Promise<void> {
    winston.log('verbose', `Connecting to ${this.address}`);
    return new Promise<void>((resolve, reject) => {
      this.socket.connect(this.port, this.host, resolve);
    })
    .timeout(Connection.TIMEOUT);
  }

  disconnect(): Promise<boolean> {
    winston.log('verbose', `Ending connection to ${this.address}`);
    return new Promise<boolean>((resolve, reject) => {
      this.socket.end();
      this.once('close', resolve);
    })
    .timeout(Connection.TIMEOUT)
    .catch(Promise.TimeoutError, () => {
      return new Promise<boolean>((resolve, reject) => {
        winston.log('warn', `Error while disconnecting from ${this.address}, forcing`);
        this.socket.destroy();
        this.once('close', resolve);
      });
    });
  }

  send(data: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.connected) {
        var error = `Couldn't send data to ${this.address}: not connected`;
        winston.log('error', error);
        return reject(new Error(error));
      }
      winston.log('silly', `Sending data to ${this.address}: "${data}"`);
      this.socket.write(data, resolve);
    })
    .timeout(Connection.TIMEOUT); 
  }
}

export = Connection;