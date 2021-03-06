/*
 * Socket interface based on socket.io.  
 */

/*jslint browser: true, bitwise: false, plusplus: false */
/*global Util, Base64 */

Websock_native = false;
UsingSocketIO = true;
ws_proxy = "http://localhost:8000/";

(function () {
    function get_INCLUDE_URI() {
        return (typeof INCLUDE_URI !== "undefined") ?
            INCLUDE_URI : "include/";
    }

    var start = "<script src='" + get_INCLUDE_URI(),
        end = "'><\/script>", extra = "";
    extra += start + "socket.io.js" + end;
    document.write(extra);
}());


function Websock(sock) {
"use strict";

  var socket = sock;
  
var api = {},         // Public API
    websocket = null, // WebSocket object
    rQ = [],          // Receive queue
    rQi = 0,          // Receive queue index
    rQmax = 10000,    // Max receive queue size before compacting
    sQ = [],          // Send queue

    eventHandlers = {
        'message' : function() {},
        'open'    : function() {},
        'close'   : function() {},
        'error'   : function() {}
    },

    test_mode = false;


//
// Queue public functions
//

function get_sQ() {
    return sQ;
}

function get_rQ() {
    return rQ;
}
function get_rQi() {
    return rQi;
}
function set_rQi(val) {
    rQi = val;
}

function rQlen() {
    return rQ.length - rQi;
}

function rQpeek8() {
    return (rQ[rQi]      );
}
function rQshift8() {
    return (rQ[rQi++]      );
}
function rQunshift8(num) {
    if (rQi === 0) {
        rQ.unshift(num);
    } else {
        rQi -= 1;
        rQ[rQi] = num;
    }

}
function rQshift16() {
    return (rQ[rQi++] <<  8) +
           (rQ[rQi++]      );
}
function rQshift32() {
    return (rQ[rQi++] << 24) +
           (rQ[rQi++] << 16) +
           (rQ[rQi++] <<  8) +
           (rQ[rQi++]      );
}
function rQshiftStr(len) {
    if (typeof(len) === 'undefined') { len = rQlen(); }
    var arr = rQ.slice(rQi, rQi + len);
    rQi += len;
    return arr.map(function (num) {
            return String.fromCharCode(num); } ).join('');

}
function rQshiftBytes(len) {
    if (typeof(len) === 'undefined') { len = rQlen(); }
    rQi += len;
    return rQ.slice(rQi-len, rQi);
}

function rQslice(start, end) {
    if (end) {
        return rQ.slice(rQi + start, rQi + end);
    } else {
        return rQ.slice(rQi + start);
    }
}

// Check to see if we must wait for 'num' bytes (default to FBU.bytes)
// to be available in the receive queue. Return true if we need to
// wait (and possibly print a debug message), otherwise false.
function rQwait(msg, num, goback) {
    var rQlen = rQ.length - rQi; // Skip rQlen() function call
    if (rQlen < num) {
        if (goback) {
            if (rQi < goback) {
                throw("rQwait cannot backup " + goback + " bytes");
            }
            rQi -= goback;
        }
        //Util.Debug("   waiting for " + (num-rQlen) +
        //           " " + msg + " byte(s)");
        return true;  // true means need more data
    }
    return false;
}

//
// Private utility routines
//

function encode_message() {
    /* base64 encode */
    return Base64.encode(sQ);
}

function decode_message(data) {
  //Util.Debug(">> decode_message: " + data);
    /* base64 decode */
    rQ = rQ.concat(Base64.decode(data, 0));
  //Util.Debug(">> decode_message, rQ: " + rQ);
}


//
// Public Send functions
//

function flush() {
    if (websocket.bufferedAmount !== 0) {
        Util.Debug("bufferedAmount: " + websocket.bufferedAmount);
    }
    if (websocket.bufferedAmount < api.maxBufferedAmount) {
        //Util.Debug("arr: " + arr);
        //Util.Debug("sQ: " + sQ);
        if (sQ.length > 0) {
            websocket.send(encode_message(sQ));
            sQ = [];
        }
        return true;
    } else {
        Util.Info("Delaying send, bufferedAmount: " +
                websocket.bufferedAmount);
        return false;
    }
}

// overridable for testing
function send(arr) {
    //Util.Debug(">> send_array: " + arr);
    sQ = sQ.concat(arr);
    return flush();
}

function send_string(str) {
    //Util.Debug(">> send_string: " + str);
    api.send(str.split('').map(
        function (chr) { return chr.charCodeAt(0); } ) );
}

//
// Other public functions

function recv_message(data) {
  Util.Debug(">> recv_message: " + data);

    try {
        decode_message(data);
        if (rQlen() > 0) {
            eventHandlers.message();
            // Compact the receive queue
            if (rQ.length > rQmax) {
                //Util.Debug("Compacting receive queue");
                rQ = rQ.slice(rQi);
                rQi = 0;
            }
        } else {
            Util.Debug("Ignoring empty message");
        }
    } catch (exc) {
      Util.Info("recv_message: exception");
        if (typeof exc.stack !== 'undefined') {
            Util.Warn("recv_message, caught exception: " + exc.stack);
        } else if (typeof exc.description !== 'undefined') {
            Util.Warn("recv_message, caught exception: " + exc.description);
        } else {
            Util.Warn("recv_message, caught exception:" + exc);
        }
        if (typeof exc.name !== 'undefined') {
            eventHandlers.error(exc.name + ": " + exc.message);
        } else {
            eventHandlers.error(exc);
        }
    }
  Util.Debug("<< recv_message");
}


// Set event handlers
function on(evt, handler) { 
    eventHandlers[evt] = handler;
}

function init() {
    rQ         = [];
    rQi        = 0;
    sQ         = [];
    websocket  = null;
}

function open(uri) {
  Util.Debug(">> socketio.connect");
  Util.Info("socketio.sock: " + sock);
    init();
  Util.Info("socketio.sock.connected: " + sock.connected);

    if (test_mode) {
        websocket = {};
    } else if( sock ) {
      websocket = sock;
      websocket.bufferedAmount = 0;
      eventHandlers.open();
      
    } else {
        websocket = io.connect(uri, {'force new connection':true /*, transports: ['xhr-polling']*/ });
        websocket.bufferedAmount = 0;
    }

    websocket.on('message', recv_message);
    websocket.on('connect', function() {
        Util.Debug(">> WebSock.onopen");
        //if (websocket.protocol) {
        //    Util.Info("Server chose sub-protocol: " + websocket.protocol);
        //}
        eventHandlers.open();
        Util.Debug("<< WebSock.onopen");
    });
    websocket.on('disconnect', function(e) {
        Util.Debug(">> WebSock.onclose");
        eventHandlers.close(e);
        Util.Debug("<< WebSock.onclose");
    });
    /*websocket.onerror = function(e) {
        Util.Debug(">> WebSock.onerror: " + e);
        eventHandlers.error(e);
        Util.Debug("<< WebSock.onerror");
    };*/
  Util.Debug("<< socketio.connect");

}

function close() {
    if (websocket)
        websocket.disconnect();
    /*if (websocket) {
        if ((websocket.readyState === WebSocket.OPEN) ||
            (websocket.readyState === WebSocket.CONNECTING)) {
            Util.Info("Closing WebSocket connection");
            websocket.close();
        }
        websocket.onmessage = function (e) { return; };
    }*/
}

// Override internal functions for testing
// Takes a send function, returns reference to recv function
function testMode(override_send) {
    test_mode = true;
    api.send = override_send;
    api.close = function () {};
    return recv_message;
}

function constructor() {
    // Configuration settings
    api.maxBufferedAmount = 200;

    // Direct access to send and receive queues
    api.get_sQ       = get_sQ;
    api.get_rQ       = get_rQ;
    api.get_rQi      = get_rQi;
    api.set_rQi      = set_rQi;

    // Routines to read from the receive queue
    api.rQlen        = rQlen;
    api.rQpeek8      = rQpeek8;
    api.rQshift8     = rQshift8;
    api.rQunshift8   = rQunshift8;
    api.rQshift16    = rQshift16;
    api.rQshift32    = rQshift32;
    api.rQshiftStr   = rQshiftStr;
    api.rQshiftBytes = rQshiftBytes;
    api.rQslice      = rQslice;
    api.rQwait       = rQwait;

    api.flush        = flush;
    api.send         = send;
    api.send_string  = send_string;

    api.on           = on;
    api.init         = init;
    api.open         = open;
    api.close        = close;
    api.testMode     = testMode;

    return api;
}

return constructor();

}
