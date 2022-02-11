

let svgScale = 0.4;

// TODO: Raumbelegung überarbeiten mit true/false

/**
 * ##########################################################################################
 * Define your rooms. Coordinates starts at upper left corner...
 * 
 * Property key "color" is optional, e.g. { name: "Kueche", x: 0, y: 0, w: 360, h: 200, color: "red"},
 * Key "name" must contain only letters! No whitespaces and any special characters are allowed!
 * ##########################################################################################
 */

let defaultColorRooms = "blue";
let RoomDef = [
    { name: "Kueche",       x:   0, y:   0, w: 360, h: 200},
    { name: "Gaestezimmer", x:   0, y: 220, w: 360, h: 280},
    { name: "Badezimmer",   x:   0, y: 520, w: 360, h: 220},
    { name: "Essbereich",   x: 380, y:   0, w: 230, h: 230},
    { name: "Wohnzimmer",   x: 380, y: 230, w: 230, h: 230},
    { name: "Wohnzimmer",   x: 610, y:   0, w: 370, h: 460},
    { name: "Flur",         x: 380, y: 460, w: 380, h: 200},
    { name: "Flur",         x: 380, y: 660, w: 150, h: 110},
    { name: "GastWC",       x: 550, y: 680, w: 150, h:  90},
    { name: "Schlafzimmer", x: 780, y: 480, w: 350, h: 400}
];



/**
 * ##########################################################################################
 * Define your scanner. Coordinates starts at upper left corner...
 * 
 * Property key "color" is optional, e.g. gast1: { x: 260, y: 230, color: "red"},
 * Key name must be same as configured in presense scanner!
 * ##########################################################################################
 */

let defaultColorScanner = "white";
let defaultRadiusScanner = 10;
// Property key "color" is optional
let ScannerDef = {
    wohnz1: { x: 640, y: 13},
    wohnz2: { x: 580, y: 450},
    wohnz3: { x: 980, y: 430}
};

// 980 in Ecke

/**
 * ##########################################################################################
 * Define your beacons. Coordinates starts at upper left corner...
 * Property color not possible, change only at default color possible
 * ##########################################################################################
 */

let defaultColorBeacon = "red";
let defaultRadiusBeacon = 5;
let BeaconDef = {
    MiBand: "mqtt-client.0.espresense.devices.mifit:c1090a022232",
    One8Pro: "mqtt-client.0.espresense.devices.iBeacon:5a7a3358-247b-4e68-9d6e-6ced93ff93f1-0-0",
    Iphone: "mqtt-client.0.espresense.devices.apple:iphone13-3"
};





const mathjs = require("mathjs");

let praefixStates = `javascript.${instance}.IndoorPositioning.`;

function dbglog(){
    return false
}

let InstArrRooms = [];
let InstJsScanner = {};
let InstArrBeacons = [];


function pushStates( JsStates, cb) {
    let actStateName, State;
    let create = () => {
        createState( State.id, State.common, State.native, () => {
            setTimeout( ()=>{ 
                if ( getState( State.id).val === null) setState( State.id, State.initial, true);
                delete ownJsStates[ actStateName];
                pushStates( ownJsStates, cb);
            }, 200)
        });
    }
    let ownJsStates = JSON.parse( JSON.stringify( JsStates));
    if ( Object.keys( ownJsStates).length === 0){
        cb && cb();
    } else {
        let ArrStateNames = Object.keys( ownJsStates);
        actStateName = ArrStateNames[0]
        State = ownJsStates[ actStateName];
        let exists = existsState( State.id);
        // Workaround needed if REDIS is used! createState() with initial value not possible!
        if ( exists && State.forceCreation){
            deleteState( State.id, ()=>{
                create();
            });
        } else {
            create();
        }
    }
}


class Room {
    
    constructor( name, x, y, w, h, fill = defaultColorRooms) {
        this.name = name;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.fill = fill;
        this.svg = `<rect x="${this.x*svgScale}" y="${this.y*svgScale}" width="${this.w*svgScale}" height="${this.h*svgScale}" style="fill:none; stroke:${this.fill}; stroke-width:2" />`;
        // filled rect: `<rect x="${this.x}" y="${this.y}" width="${this.w}" height="${this.h}" style="fill:${this.fill}" />`
    }

    isInRoom( x, y){ return ( x >= this.x && x <= (this.x + this.w) && y >= this.y && y <= (this.y + this.h) ) }
}


class Scanner {
    constructor( name, fill = defaultColorScanner) {
        this.name = name;
        this.x = ScannerDef[ name].x;
        this.y = ScannerDef[ name].y;
        this.r = defaultRadiusScanner;
        this.fill = fill;
        this.svg = `
            <circle cx="${this.x*svgScale}" cy="${this.y*svgScale}" r="${this.r*svgScale}" fill=${this.fill} />
            <text x="${(this.x+this.r+5)*svgScale}" y="${(this.y+5)*svgScale}" stroke="${this.fill}" stroke-width="1" fill=none>${this.name}</text>
        `;
    }

    getCircle( r){
        return `<circle cx="${this.x*svgScale}" cy="${this.y*svgScale}" r="${r*svgScale}" stroke="${this.fill}" stroke-width="2" fill=none />`
    }
}


class Beacon {
    constructor( name, mqttId, svgBasic, fill = defaultColorBeacon) {
        this.name = name;
        this.mqttId = mqttId;
        this.fill = fill;
        this.StateDef;
        this.svgBasic = svgBasic;
        this.svgScannerCircles = "";
        this.svgBeaconCircle = "";

        this.praefixStates = `${praefixStates}${this.name}.`;
        this.DetectedScanner = [];
        this._init();
    }

    _init(){
        this.StateDef = {
            VIS_HTML: {
                id: "VIS_HTML",
                initial: "",
                forceCreation: false,
                common: { role: "state", read: true, write: false, name: "IndoorPositioning.VIS_HTML", type: "string" },
                native: {}
            },
            ROOM_DEFAULT: {  /** Copy for each defined Room */
                id: "Rooms.",
                initial: false,
                forceCreation: false,
                common: { role: "state", read: true, write: false, name: "Room Presence", type: "boolean" },
                native: {}
            }
        };

        // Get all Rooom Names
        RoomDef.forEach( Room => {
            if ( !this.StateDef.hasOwnProperty( Room.name) ){
                this.StateDef[ Room.name] = JSON.parse( JSON.stringify( this.StateDef[ "ROOM_DEFAULT"] ) ); // Copy ROOMS-DEFAULT to new Room state
                this.StateDef[ Room.name].id = this.StateDef[ Room.name].id + Room.name;
            }
        });
        delete this.StateDef[ "ROOM_DEFAULT"];

        // Extend all IDs with own praefixStates
        Object.keys( this.StateDef).forEach( ele => {
            let completeID = `${this.praefixStates}${ this.StateDef[ ele].id}`;
            this.StateDef[ ele].id = completeID;
        });

        pushStates( this.StateDef, () => {
            if (dbglog()) console.log( `States created for Beacon "${this.name}"`);
            this._writeSVG();
            $( this.mqttId + ".*").each( (id, i) => { if ( id !== "undefined") this.DetectedScanner.push( id) });
            this._subscribeScanners();
        });
    }

    _subscribeScanners(){
        on({id: this.DetectedScanner, change: "ne"}, ( obj) => {
            this._processScans();
        });
    }

    _processScans(){
        // Get range circles from each scanner and beacon
        let ScanResults = {};
        this.svgBeaconCircle = "";
        this.svgScannerCircles = "";
        this.DetectedScanner.forEach( id => {
            let scannerName = id.split(".").pop();
            if ( ScannerDef.hasOwnProperty( scannerName) ) {
                ScanResults[ scannerName] = JSON.parse( getState( id).val).distance * 100;
                //ScanResults[ scannerName] = JSON.parse( getState( id).val).raw * 100;
                this.svgScannerCircles = this.svgScannerCircles + InstJsScanner[ scannerName].getCircle( ScanResults[ scannerName]);
            } else {
                console.log( `Scanner "${scannerName}" found in MQTT states "${this.mqttId}" but not defined in variable "ScannerDef". Define Scanner with X/Y coordinates and restart script!`)
            }
        });

        // Get closest 3 scanner to beacon
        let ClosestScanners = [];
        Object.keys( ScanResults).forEach( scannerName => {
            ClosestScanners.push( { name: scannerName, dist: ScanResults[ scannerName]});
            ClosestScanners.sort( (a, b) => { return a.dist - b.dist });
            if ( ClosestScanners.length > 3) ClosestScanners.pop();
        });

        if ( ClosestScanners.length === 3){
            let res = trilaterate(
                [ ScannerDef[ ClosestScanners[0].name ].x, ScannerDef[ ClosestScanners[0].name ].y, ClosestScanners[0].dist ],
                [ ScannerDef[ ClosestScanners[1].name ].x, ScannerDef[ ClosestScanners[1].name ].y, ClosestScanners[1].dist ],
                [ ScannerDef[ ClosestScanners[2].name ].x, ScannerDef[ ClosestScanners[2].name ].y, ClosestScanners[2].dist ]
            )
            //console.log( res);
            this.svgBeaconCircle = this._getCircle( res.x, res.y, res.ur);
            this._setRoomPresenceStates( res.x, res.y);
        }

        this._writeSVG();
        
    }

    _setRoomPresenceStates( x, y){
        InstArrRooms.forEach( Room => {
            if (dbglog()) console.log( "Checking for Room: " + Room.name);
            this._write( Room.name, Room.isInRoom( x, y));
        });
    }

    _getCircle( x, y, r){
        return `
            <circle cx="${x*svgScale}" cy="${y*svgScale}" r="${r*svgScale}" stroke="${this.fill}" stroke-width="2" fill=none />
            <circle cx="${x*svgScale}" cy="${y*svgScale}" r="${defaultRadiusBeacon*svgScale}" fill=${this.fill} />
        `
    }

    _writeSVG(){
        let svg =  this.svgBasic + this.svgScannerCircles + this.svgBeaconCircle + "</svg>";
        this._write( "VIS_HTML", svg);
    }

    _write( jsKey, value, ack = true) {
        if (dbglog()) console.log(`Write state: ${this.StateDef[ jsKey].id} = ${ ( value === "" ? '' : value)} (ack = ${ack})`);
        setState( this.StateDef[ jsKey].id, value, ack);
    }
}







function main(){

    // Instantiate Rooms
    RoomDef.forEach( JsRoom => {
        if ( JsRoom.hasOwnProperty( "color") ) InstArrRooms.push( new Room( JsRoom.name, JsRoom.x, JsRoom.y, JsRoom.w, JsRoom.h, JsRoom.color) );
        else InstArrRooms.push( new Room( JsRoom.name, JsRoom.x, JsRoom.y, JsRoom.w, JsRoom.h) );
    });
    
    // Instantiate Scanner
    Object.keys( ScannerDef).forEach( scanner => {
        let Obj = ScannerDef[ scanner];
        if ( Obj.hasOwnProperty( "color") ) InstJsScanner[ scanner] = new Scanner( scanner, Obj.color);
        else InstJsScanner[ scanner] = new Scanner( scanner);
    })

    // Get Rooms SVG
    let svgH = 0;
    let svgW = 0;
    let svgRooms = "";
    InstArrRooms.forEach( Room => {
        if ( Room.x + Room.w > svgW) svgW = Room.x + Room.w;
        if ( Room.y + Room.h > svgH) svgH = Room.y + Room.h;
        svgRooms = svgRooms + Room.svg;
    });

    // Get Scanners SVG
    let svgScanner = "";
    Object.keys( InstJsScanner).forEach( Scanner => {
        svgScanner = svgScanner + InstJsScanner[ Scanner].svg;
    })


    let svgBasic = `
        <svg width="${svgW}" height="${svgH}" >
        ${svgRooms}
        ${svgScanner}
    `;
    // "</svg>" will be added when writing to state from baecon class...

    Object.keys( BeaconDef).forEach( key => {
        InstArrBeacons.push( new Beacon( key, BeaconDef[ key], svgBasic ) )
    });

}
main();





// Beispiel: console.log(trilaterate( [0,0,7], [10,0,7], [5,8.66,7] ))
/**
  * Berechnet triangulierten Punkt inkl. Unschärfe-Radius
  *
  * Basis-Gleichung lautet:
  * (x - x_i)² + (y - y_i)² = (r_i + ur)²,
  * mit i = 1,2,3 und ur = Unschärferadius
  * -> x² + x_i² - 2x_i*x + y² + y_i² - 2y_i*y = r_i² + u² + 2r_i*u
  *
  * Angelehnt an Lösungsweg: https://stackoverflow.com/a/56294794
  * Änderung: statt "= (r_i * k)² wird "= (r_i + ur)²" verwendet!
  *
  * @param {Object} p1 First point and radius: [ x, y, r ]
  * @param {Object} p2 Second point and radius: [ x, y, r ]
  * @param {Object} p3 Third point and radius: [ x, y, r ]
  * @return {Object} tril. Point and error-radius { x, y, ur }
  */
function trilaterate (p1, p2, p3) {
    //console.log( p1);console.log( p2);console.log( p3);
 
    function sqr (a) {return a*a};
    function sqrt (a) {return mathjs.sqrt(a)};
 
    function solvePQ (p,q) {
        let d = sqr(p)/4 - q;
        if (d >= 0){
            let x1 = -p/2 + sqrt(d);
            let x2 = -p/2 - sqrt(d);
            return [x1, x2]
        } else {
            return []
        }
    }
 
    let x1 = p1[0], y1 = p1[1], r1 = p1[2],
        x2 = p2[0], y2 = p2[1], r2 = p2[2],
        x3 = p3[0], y3 = p3[1], r3 = p3[2];
 
    // Gl. a_i: x² + x_i² - 2x_i*x + y² + y_i² - 2y_i*y = r_i² + u² + 2r_i*u
    // Gl. a_1 - Gl. a_2 und Gl. a_1 - Gl.a_3 eliminiert x²/y² und ergibt ein LGS
    // A * X = C + B * u >>> X = A^-1 * C + A^-1 * B * u
 
    let A = [
        [ 2*(x2 - x1), 2*(y2 - y1) ],
        [ 2*(x3 - x1), 2*(y3 - y1) ]
    ];
 
    let C = [
        sqr(r1) - sqr(r2) - sqr(x1) + sqr(x2) - sqr(y1) + sqr(y2),
        sqr(r1) - sqr(r3) - sqr(x1) + sqr(x3) - sqr(y1) + sqr(y3)
    ];
 
    let B = [ 2*(r1 - r2), 2*(r1 - r3) ];
 
    let A_inv = mathjs.inv(A);
    let A_invC = mathjs.multiply(A_inv, C);
    let A_invB = mathjs.multiply(A_inv, B);
 
    // x = A_invC[0] + A_invB[0] * u, und y = A_invC[1] + A_invB[1] * u
    // x = c1 + c2 * u, und y = c3 + c4 * u in Gl. a_1
 
    let c1 = A_invC[0];
    let c2 = A_invB[0];
    let c3 = A_invC[1];
    let c4 = A_invB[1];
    
    let quot = sqr(c2) + sqr(c4) - 1;
    let p = (2*c1*c2 - 2*x1*c2 + 2*c3*c4 - 2*y1*c4 - 2*r1) / quot;
    let q = (sqr(c1) + sqr(x1) - 2*x1*c1 + sqr(c3) + sqr(y1) - 2*y1*c3 - sqr(r1)) / quot;
 
    let arrU = solvePQ(p,q);
 
    if (arrU == []) return "ur konnte nicht berechnet werden!";
 
    let u = arrU[0]; // Bisherige Tests: arrU[0] scheint immer zu passen?
    let x = c1 + c2 * u;
    let y = c3 + c4 * u;

    u = Math. abs( u);
 
    return { x: x.toFixed(2), y: y.toFixed(2), ur: u.toFixed(2) }
    
}



