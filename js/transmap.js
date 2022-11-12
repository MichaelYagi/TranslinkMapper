//TODO:
// * Clean up code
// * Make smarter when checking checkboxes
//   * eg. Don't update stops if they were previously enabled
// * Include schedule information in stops object
// * APC caching for routes
// * Implement realtime transit updates:
//   * https://developer.translink.ca/ServicesGtfs/ApiReference
// 	 * https://developers.google.com/transit/gtfs-realtime/reference/

/*
 * Setup
 */
var TranslinkMap = {
	// Constants
	REQUEST_TIMEOUT: 2000, // Timeout request time in milliseconds
	MAP_INIT_CENTER: {lat: 49.251415, lng: -123.120501},
	TM_BASE_URL: "http://api.translink.ca/rttiapi/v1/",
	TS_API_KEY: "<translink_api_key>",
	ROAD_CLOSURE_URL: "http://api.open511.gov.bc.ca/events?area_id=drivebc.ca/1",	
	BUS_COLORS: [
		"F49AC2",
		"CB99C9",
		"C23B22",
		"FFD1DC",
		"DEA5A4",
		"AEC6CF",
		"77DD77",
		"CFCFC4",
		"B39EB5",
		"FFB347",
		"B19CD9",
		"FF6961",
		"03C03C",
		"FDFD96",
		"779ECB",
		"966FD6",
		"1B85B8",
		"5A5255",
		"559E83",
		"AE5A41",
		"C3CB71"
	],
	// Configurable
	map: null,
	debug: false,
	nearestStops: false,
	seeRoutes: false,
	seeTraffic: false,
	seeTransit: false,
	seeClosures: false,
	infoWindow: false,
	findMyLocation: false,
	mapRefreshSeconds: 0,
	// Tracking
	busMarkers: [],
	stopMarkers: [],
	closureMarkers: [],
	layers: [],
	routeKmzUrls: [],
	stops: [],
	routes: [],
	buses: [],
	closures: [],
	routeNumbers: "",
	busNumbers: "",
	gtfsData: {},
	tmQueries: {
		"routeNumbers": [],
		"busNumbers": []
	}
};

/*
 * Initialize Google map and inputs
 */
function initTransitMap() {
	// Create a map object and specify the DOM element for display.
	TranslinkMap.map = new google.maps.Map(document.getElementById('map'), {
		center: TranslinkMap.MAP_INIT_CENTER,
		scrollwheel: true,
		zoom: 10
	});
	
	// Clear all inputs
	clearMap(true);
	drawMap();
	
	var addCheckbox = function(name, parent) {
		var label = name.toLowerCase();
		var checkboxDiv = document.createElement('DIV');
		var controlCheckbox = document.createElement('input');
		controlCheckbox.type = "checkbox";
		controlCheckbox.id = label + "_toggle";
		controlCheckbox.name = label + "_toggle";
		controlCheckbox.value = label + "_on";

		var checkboxLabel = document.createElement('label');
		checkboxLabel.htmlFor = label + "_toggle";
	
		label = label.charAt(0).toUpperCase() + label.slice(1);
		checkboxLabel.appendChild(document.createTextNode(label));
	
		checkboxDiv.appendChild(controlCheckbox);
		checkboxDiv.appendChild(checkboxLabel);
		parent.appendChild(checkboxDiv);
		google.maps.event.addDomListener(controlCheckbox, 'change', onCheck); 
	};
    
    var inputChangeRefresh = function() {
    	clearMap(true);
		document.getElementById("loading").style.visibility = 'visible';
        TranslinkMap.routeNumbers = document.getElementById("route_number").value;
        TranslinkMap.busNumbers = document.getElementById("bus_number").value;
        TranslinkMap.mapRefreshSeconds = document.getElementById("refresh_number").value;
		
        var navbarRightDiv = document.getElementById("navbar_right_items");
        TranslinkMap.debug = false;
        if (document.getElementById("debug_toggle").checked) {
        	TranslinkMap.debug = true;
			navbarRightDiv.style.display = "block";
        } else {
			navbarRightDiv.style.display = "none";
		}
        TranslinkMap.nearestStops = false;
        if (document.getElementById("stops_toggle").checked) {
        	TranslinkMap.nearestStops = true;
        }
        TranslinkMap.seeRoutes = false;
        if (document.getElementById("routes_toggle").checked) {
        	TranslinkMap.seeRoutes = true;
        }
        TranslinkMap.seeTraffic = false;
        if (document.getElementById("traffic_toggle").checked) {
        	TranslinkMap.seeTraffic = true;
        }
		TranslinkMap.seeClosures = false;
        if (document.getElementById("closures_toggle").checked) {
        	TranslinkMap.seeClosures = true;
        }
        TranslinkMap.seeTransit = false;
        if (document.getElementById("transit_toggle").checked) {
        	TranslinkMap.seeTransit = true;
        }
        TranslinkMap.findMyLocation = false;
		if (location.protocol === 'https:' && document.getElementById("location_toggle").checked) {
			TranslinkMap.findMyLocation = true;
		}
        drawMap();
    };
    
    // Update the map on checkbox change
    var onCheck = function() {
    	inputChangeRefresh();
    };
    
    // Create a div to hold controls
    var controlDiv = document.createElement('DIV');
    controlDiv.id = "tmcontrols";
    
	// Checkboxes
	// See the routes
    addCheckbox("routes", controlDiv);
    
    // See the nearest stops
    addCheckbox("stops", controlDiv);
	
	var divider = document.createElement("hr");
	controlDiv.appendChild(divider);
    
    // See traffic
    addCheckbox("traffic", controlDiv);
	
	// See road closures
    addCheckbox("closures", controlDiv);
    
    // See Google's transit layer
    addCheckbox("transit", controlDiv);

	// Find user's location    
    if (location.protocol === 'https:') {
    	addCheckbox("location", controlDiv);
    }
    
    // Debug checkbox
    addCheckbox("debug", controlDiv);
	var navbarRightDiv = document.getElementById("navbar_right_items");
    navbarRightDiv.style.display = "none";
	
	var loadingDiv = document.getElementById("loading");
	var submitButton = document.getElementById("submit_button");

	loadingDiv.style.visibility = 'hidden'; 
    
    // Update the map on submit click
    var onClick = function() {
    	inputChangeRefresh();
    };
    google.maps.event.addDomListener(submitButton, 'click', onClick);
    
    // Position the inputs on the map
    TranslinkMap.map.controls[google.maps.ControlPosition.LEFT_CENTER].push(controlDiv);
}

// Clear all markers and routes and draw map
function drawMap() {
	// Get parameter queries
	var queryParams = queryString();
	var requestMade = false;

	for (var param in queryParams) {
		if (param.length > 0 && queryParams.hasOwnProperty(param) && queryParams.hasOwnProperty(param) && queryParams[param].length > 0) {
			var value = queryParams[param];
			if (param === "routeNumbers" || param === "busNumbers") {
				// Comma delimited list of route numbers
				value = value.split(",");
			}
			TranslinkMap.tmQueries[param] = value;
		}
	}

	if (TranslinkMap.seeClosures && TranslinkMap.ROAD_CLOSURE_URL.length > 0) {
		requestMade = true;
		tmXhrRequest("closures", TranslinkMap.ROAD_CLOSURE_URL, null, null, updateMap);
	}
	
	if (true == TranslinkMap.seeTraffic) {
		var trafficLayer = new google.maps.TrafficLayer();
		addLayer(trafficLayer);
		if (true === TranslinkMap.debug) {
			logger("info","","Adding Google Traffic layer");
		}
	}
	
	if (true === TranslinkMap.seeTransit) {
		var transitLayer = new google.maps.TransitLayer();
		addLayer(transitLayer);
		if (true === TranslinkMap.debug) {
			logger("info","","Adding Google Translit layer");
		}
	}
	
	if (TranslinkMap.tmQueries["routeNumbers"].length === 0 && (TranslinkMap.routeNumbers.length > 0 || TranslinkMap.busNumbers.length > 0)) {
		
		if (TranslinkMap.routeNumbers.length > 0) {
			if (typeof TranslinkMap.routeNumbers === 'string') {
				TranslinkMap.routeNumbers = TranslinkMap.routeNumbers.split(",");
			}
			TranslinkMap.tmQueries["routeNumbers"] = TranslinkMap.routeNumbers;
		}

		if (TranslinkMap.busNumbers.length > 0) {
			if (typeof TranslinkMap.busNumbers === 'string') {
				TranslinkMap.busNumbers = TranslinkMap.busNumbers.split(",");
			}
			TranslinkMap.tmQueries["busNumbers"] = TranslinkMap.busNumbers;
		}
	}

	if (true === TranslinkMap.debug) {
		logger("info","Translink Queries",TranslinkMap.tmQueries);
	}

	if (TranslinkMap.tmQueries["routeNumbers"].length > 0 || TranslinkMap.tmQueries["busNumbers"].length > 0) {
		requestMade = true;
		redrawMap();
		if (TranslinkMap.mapRefreshSeconds > 0) {
			setInterval(function() {
				redrawMap();
			}, TranslinkMap.mapRefreshSeconds * 1000);
		}
	}

	// Try HTML5 geolocation.
	if (location.protocol === 'https:' && true === TranslinkMap.findMyLocation) {
		if (navigator.geolocation) {
			navigator.geolocation.getCurrentPosition(function(position) {
				var myLocation = {
					lat: position.coords.latitude,
					lng: position.coords.longitude
				};

				addMarker(myLocation, "user", null, null);
			}, function() {
				if (true === TranslinkMap.debug) {
					logger("error","","The Geolocation service failed");
				}
			});
		} else {
			if (true === TranslinkMap.debug) {
				logger("error","","Your browser does not support geolocation");
			}
		}
	}
	
	if (false === requestMade) {
		document.getElementById("loading").style.visibility = 'hidden';
	}
}

// Update the markers on the map
function redrawMap() {
	clearMap(false);

	if (TranslinkMap.routeNumbers.length > 0) {
		if (typeof TranslinkMap.routeNumbers === 'string') {
			TranslinkMap.routeNumbers = TranslinkMap.routeNumbers.split(",");
		}
		TranslinkMap.tmQueries["routeNumbers"] = TranslinkMap.routeNumbers;
	}

	if (TranslinkMap.busNumbers.length > 0) {
		if (typeof TranslinkMap.busNumbers === 'string') {
			TranslinkMap.busNumbers = TranslinkMap.busNumbers.split(",");
		}
		TranslinkMap.tmQueries["busNumbers"] = TranslinkMap.busNumbers;
	}

	if (TranslinkMap.tmQueries["routeNumbers"].length > 0 || TranslinkMap.tmQueries["busNumbers"].length > 0) {

		TranslinkMap.routes = TranslinkMap.tmQueries["routeNumbers"];
		TranslinkMap.buses = TranslinkMap.tmQueries["busNumbers"];

		getTmRoutes();
		
		if (TranslinkMap.mapRefreshSeconds > 0) {
			setInterval(function() {
				if (true === TranslinkMap.debug) {
					logger("info","","Map refreshed in interval loop");
				}
				getTmRoutes();
			}, TranslinkMap.mapRefreshSeconds * 1000);
		}
	}
}

function clearMap(clearAll) {
	clearBusMarkers()
	deleteBusMarkers();

	if (true === clearAll) {
		clearStopMarkers()
		deleteStopMarkers();
		deleteStops();
		clearClosureMarkers()
		deleteClosureMarkers();
		deleteClosures();
		clearLayers();
		deleteLayers();
		TranslinkMap.tmQueries["routeNumbers"] = [];
		TranslinkMap.tmQueries["busNumbers"] = [];
		TranslinkMap.routeKmzUrls = [];
	}
}

// Get real time route information based on an array of routes queried
// Example: http://api.translink.ca/rttiapi/v1/buses?apikey=[APIKey]&routeNo=099
// Returns all active buses serving route 99
function getTmRoutes() {
	for (var i = 0;i < TranslinkMap.routes.length; i++) {
		tmXhrRequest("busRoutes",TranslinkMap.TM_BASE_URL + "buses?apikey=" + TranslinkMap.TS_API_KEY + "&routeNo=" + TranslinkMap.routes[i], TranslinkMap.routes[i], "", updateMap);
	}

	// http://api.translink.ca/rttiapi/v1/buses/7196?apikey=[APIKey]
	for (var i = 0;i < TranslinkMap.buses.length; i++) {
		tmXhrRequest("buses",TranslinkMap.TM_BASE_URL + "buses/" + TranslinkMap.buses[i] + "?apikey=" + TranslinkMap.TS_API_KEY, "", TranslinkMap.buses[i], updateMap);
	}
}

function updateMap(type, routeNumber, infoArray) {
	var busObj = {};
	var stopObj = {};
	var latLng = {};
	var kmzLayer = {};
	var infoWindowContent = "";

	if (type === "busRoutes" || type === "buses") {

		if (true === TranslinkMap.seeRoutes) {
			var addToLayersArr = true;
			for(var i = 0; i < TranslinkMap.routes.length;i++) {
				if (TranslinkMap.routes[i] === infoArray[0].RouteNo) {
					addToLayersArr = false;
				}
			}

			var kmzLayerUrl = infoArray[0].RouteMap.Href;
			for(var i = 0; i < TranslinkMap.routeKmzUrls.length;i++) {
				if (TranslinkMap.routeKmzUrls[i] === kmzLayerUrl) {
					addToLayersArr = false;
				}
			}

			if (true === addToLayersArr) {
				TranslinkMap.routeKmzUrls.push(kmzLayerUrl);
				if (type === "busRoutes") {
					TranslinkMap.routes.push(infoArray[0].RouteNo);
				}

				if (kmzLayerUrl.length > 0) {
					kmzLayer = new google.maps.KmlLayer(
						kmzLayerUrl,
						{
							map: TranslinkMap.map,
							// Don't zoom each time the KML layer is set
							preserveViewport: true
						}
					);
					addLayer(kmzLayer);
				}
			}
		}

		for (var i = 0; i < infoArray.length; i++) {
			busObj = infoArray[i];

			// Get stop information for any buses within a 500m radius
			if (true === TranslinkMap.nearestStops) {
				tmXhrRequest("stops",TranslinkMap.TM_BASE_URL + "stops?apikey=" + TranslinkMap.TS_API_KEY + "&lat=" + busObj.Latitude + "&long=" + busObj.Longitude + "&routeNo=" + busObj.RouteNo,busObj.RouteNo,"", updateMap);
			}

			latLng = new google.maps.LatLng(busObj.Latitude,busObj.Longitude);
			infoWindowContent = '<div id="content">'+
							'<div id="siteNotice">'+
							'</div>'+
							'<h1 id="firstHeading" class="firstHeading"><a href="http://nb.translink.ca/text/route/' + busObj.RouteNo + '/direction/' + busObj.Direction + '">'+busObj.Destination+'</a></h1>'+
							'<div id="bodyContent">'+
							'<p>Direction: '+busObj.Direction+'</p>' +
							'<p>Bus Number: '+busObj.VehicleNo+'</p>' +
							'<p>Last Updated At: '+busObj.RecordedTime+'</p>' +
							'</div>'+
							'</div>';
			addMarker(latLng, type, busObj, infoWindowContent);
		}
	} else if (type === "stops") {
		var addToStopsArr = true;
		for(var i = 0; i < infoArray.length; i++) {
			var j = 0;
			stopObj = infoArray[i];
			addToStopsArr = true;
			if (TranslinkMap.stops.length === 0) {
				TranslinkMap.stops.push(stopObj);
			} else {
				for (j = 0; j < TranslinkMap.stops.length; j++) {
					if (TranslinkMap.stops[i].StopNo === stopObj.StopNo) {
						addToStopsArr = false;
					}
				}
			}

			if (true === addToStopsArr) {
				TranslinkMap.stops.push(stopObj);
				var routes = stopObj.Routes.split(",");
				var routesStr = "";
				for(j = 0;j < routes.length;j++) {
					routesStr += '<a href="http://nb.translink.ca/text/stop/' + stopObj.StopNo + '/route/' + routes[j].trim() + '">'+routes[j].trim() + '</a>';

					if (j < (routes.length-1)) {
						routesStr += ", ";
					}
				}
				latLng = new google.maps.LatLng(stopObj.Latitude,stopObj.Longitude);
				infoWindowContent = '<div id="content">'+
							'<div id="siteNotice">'+
							'</div>'+
							'<h1 id="firstHeading" class="firstHeading"><a href="http://nb.translink.ca/text/stop/' + stopObj.StopNo + '">'+stopObj.Name+'</a></h1>'+
							'<div id="bodyContent">'+
							'<p>Stop Number: '+stopObj.StopNo+'</p>' +
							'<p>Routes: '+ routesStr +'</p>' +
							'<p>Street: '+stopObj.OnStreet+'</p>' +
							'<p>Intersection: '+stopObj.AtStreet+'</p>' +
							'<p>City: '+stopObj.City+'</p>' +
							'</div>'+
							'</div>';
				addMarker(latLng, type, stopObj, infoWindowContent)
			}
		}
	} else if (type === "closures") {	
		var closures = infoArray[0].events;
		for (var i=0;i<closures.length;i++) {
			var closure = closures[i];
			TranslinkMap.closures.push(closure);
		
			var coordinates = [];
			if (closure.geography.type === "Point") {
				coordinates.push(closure.geography.coordinates);
			} else {
				coordinates = closure.geography.coordinates;
			}

			for(var j=0;j<coordinates.length;j++) {
				var coordinate = coordinates[j];
				latLng = new google.maps.LatLng(coordinate[1],coordinate[0]);
				var roadsAffectedStr = "";
				if (closure.roads.length>0) {
					roadsAffectedStr += "<ul>";
					for (var k=0;k<closure.roads.length;k++) {
						var road = closure.roads[k];
						roadsAffectedStr += "<li>";
						roadsAffectedStr += "Direction - " + road.direction + " " + road.state + " at " + road.name;
						roadsAffectedStr += "</li>";
					}
					roadsAffectedStr += "</ul>";
				}
				var eventType = closure.event_type;
				var heading = eventType.replace("_", " ");
				infoWindowContent = '<div id="content">'+
							'<div id="siteNotice">'+
							'</div>'+
							'<h1 id="firstHeading" class="firstHeading">'+heading+'</h1>'+
							'<div id="bodyContent">'+
							'<p>Severity: '+closure.severity+'</p>' +
							'<p>Status: '+closure.status+'</p>' +
							'<p>'+closure.description+'</p>' +
							'<p>'+roadsAffectedStr+'</p>' +
							'</div>'+
							'</div>';
				addMarker(latLng, type, closure, infoWindowContent);
			}
		}
	}
}

// Calls php proxy and execute curl calls
function tmXhrRequest(type, url, routeNumber, busNumber, callback) {

	if (true === TranslinkMap.debug) {
		logger("info","","routeNumber: " + routeNumber + "<br>busNumber: " + busNumber + "<br>Endpoint request type: " + type + "<br>Endpoint request: " + url);
	}

	var proxyUrl = "./proxy.php";

	//http://api.translink.ca/rttiapi/v1/stops/60980/estimates?apikey=[APIKey]
	var stopEstimateBaseUrl = ("stops" === type) ? TranslinkMap.TM_BASE_URL + "stops/__STOPNO__/estimates?apikey=" + TranslinkMap.TS_API_KEY : "";

	var params = "";
	if ("stops" === type) {
		params = "url=" + encodeURIComponent(url) + "|" + encodeURIComponent(stopEstimateBaseUrl) + "&type=tlm_stop_api";
	} else {
		params = "url=" + encodeURIComponent(url) + "&type=tlm_api";
	}

	var xhttp = new XMLHttpRequest();
	xhttp.timeout = TranslinkMap.REQUEST_TIMEOUT; // time in milliseconds
	xhttp.open("POST", proxyUrl, true);
	xhttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
	xhttp.onreadystatechange = function() {
		if (xhttp.readyState == 4) {
			if (xhttp.status == 200) {
				var respObj = {};
				try {
					respObj = JSON.parse(xhttp.responseText);
					if (respObj.constructor !== Array) {
						respObj = [respObj];
					}
				} catch(e) {}

				if (true === TranslinkMap.debug) {
					logger("info","Response for " + type,respObj);
				}

				if (respObj[0] != null && respObj[0].hasOwnProperty("Code")) {
					try {
						respObj = respObj[0];
						respObj.Endpoint = url;
					} catch(e) {}
					
					if (true === TranslinkMap.debug) {
						logger("error","Response Error",respObj);
					}

					switch(respObj["Code"]) {
						case "2015":
							if (routeNumber.length > 0) {
								for(var i = TranslinkMap.routes.length - 1; i >= 0; i--) {
									if(TranslinkMap.routes[i] === routeNumber) {
									   TranslinkMap.routes.splice(i, 1);
									}
								}
							}
							break;
					}
					
					document.getElementById("loading").style.visibility = 'hidden';
					return;
				}
				document.getElementById("loading").style.visibility = 'hidden';
				if (respObj.constructor === Array && (respObj[0].hasOwnProperty("events") || respObj[0].hasOwnProperty("RouteNo") || ("stops" === type && respObj[0].hasOwnProperty("Routes")))) {
					if (true === TranslinkMap.debug) {
						logger("info","Endpoint response",respObj);
					}
					callback(type, routeNumber, respObj);
				}
   			}
		}
	};
	xhttp.ontimeout = function () {
		if (true === TranslinkMap.debug) {
			logger("info","","Request has timed out");
		}
		document.getElementById("loading").style.visibility = 'hidden';
	};
	xhttp.send(params);
}

// Adds a marker to the map and push to the array.
function addMarker(location, type, obj, infoWindowContent) {

	var marker = {};

	if (type === "busRoutes" || type === "buses") {
		var routeString = obj.RouteNo + obj.Direction;
		var iconColor = intToRGB(hashCode(routeString));

		marker = new google.maps.Marker({
			position: location,
			icon: "http://chart.apis.google.com/chart?chst=d_map_spin&chld=0.69|0|" + iconColor + "|13|b|" + obj.RouteNo,
			map: TranslinkMap.map
		});

		TranslinkMap.busMarkers.push(marker);
	} else if (type === "stops") {
		marker = new google.maps.Marker({
			position: location,
			icon: "http://maps.google.com/mapfiles/dd-end.png",
			map: TranslinkMap.map
		});
	} else if (type === "user") {
		marker = new google.maps.Marker({
			position: location,
			icon: "http://maps.gstatic.com/mapfiles/markers2/arrow.png",
			map: TranslinkMap.map
		});
	} else if (type === "closures") {
		// Status is unknown
		var icon = "http://maps.google.com/mapfiles/ms/micons/blue-pushpin.png";

		switch (obj.severity) {
			case "MAJOR":
				icon = "http://maps.google.com/mapfiles/ms/micons/red-pushpin.png";
				break;
			case "MODERATE":
				icon = "http://maps.google.com/mapfiles/ms/micons/red-pushpin.png";
				break;
			case "MINOR":
				icon = "http://maps.google.com/mapfiles/ms/micons/grn-pushpin.png";
				break;	
			default:
				icon = "http://maps.google.com/mapfiles/ms/micons/blue-pushpin.png";
		}
		
		marker = new google.maps.Marker({
			position: location,
			icon: icon,
			map: TranslinkMap.map
		});
	}

	if (null !== infoWindowContent && infoWindowContent.length > 0) {
       	google.maps.event.addListener(marker, 'click', function(){
        	if (TranslinkMap.infoWindow) {
        		TranslinkMap.infoWindow.close();
        	}
        	TranslinkMap.infoWindow = new google.maps.InfoWindow({
          			content: infoWindowContent,
					disableAutoPan : true
        		});
        	TranslinkMap.infoWindow.open(TranslinkMap.map,marker);
		});

		TranslinkMap.stopMarkers.push(marker);
	}
}

function addLayer(layer) {
	layer.setMap(TranslinkMap.map);
	TranslinkMap.layers.push(layer);
}

// Sets the map on all layers in the array.
function setMapOnAll(type, map) {
	for (var i = 0; i < type.length; i++) {
		type[i].setMap(map);
	}
}

// Removes the layers from the map, but keeps them in the array.
function clearLayers() {
	setMapOnAll(TranslinkMap.layers,null);
}

// Deletes all layers in the array by removing references to them.
function deleteLayers() {
	clearLayers();
	TranslinkMap.layers = [];
}

// Deletes all layers in the array by removing references to them.
function deleteStops() {
	TranslinkMap.stops = [];
}

// Deletes all layers in the array by removing references to them.
function deleteClosures() {
	TranslinkMap.closures = [];
}

// Removes the markers from the map, but keeps them in the array.
function clearBusMarkers() {
	setMapOnAll(TranslinkMap.busMarkers,null);
}

// Deletes all markers in the array by removing references to them.
function deleteBusMarkers() {
	clearBusMarkers();
	TranslinkMap.busMarkers = [];
	TranslinkMap.routes = [];
	TranslinkMap.buses = [];

	TranslinkMap.routeNumbers = "";
	TranslinkMap.busNumbers = "";
}

// Removes the markers from the map, but keeps them in the array.
function clearStopMarkers() {
	setMapOnAll(TranslinkMap.stopMarkers,null);
}

// Deletes all markers in the array by removing references to them.
function deleteStopMarkers() {
	clearStopMarkers();
	TranslinkMap.stopMarkers = [];
}

// Removes the markers from the map, but keeps them in the array.
function clearClosureMarkers() {
	setMapOnAll(TranslinkMap.closureMarkers,null);
}

// Deletes all markers in the array by removing references to them.
function deleteClosureMarkers() {
	clearClosureMarkers();
	TranslinkMap.closureMarkers = [];
}

function queryString() {
	// This function is anonymous, is executed immediately and
  	// the return value is assigned to QueryString!
  	var query_string = {};
  	var query = window.location.search.substring(1);
  	var vars = query.split("&");

  	for (var i=0;i < vars.length;i++) {
		var pair = vars[i].split("=");
		// If first entry with this name
		if (typeof query_string[pair[0]] === "undefined") {
			query_string[pair[0]] = decodeURIComponent(pair[1]);
		// If second entry with this name
		} else if (typeof query_string[pair[0]] === "string") {
			var arr = [ query_string[pair[0]],decodeURIComponent(pair[1]) ];
			query_string[pair[0]] = arr;
		// If third or later entry with this name
		} else {
			query_string[pair[0]].push(decodeURIComponent(pair[1]));
		}
	}
	return query_string;
}

function hashCode(str) { // java String#hashCode
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
       hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    hash = Math.abs(hash);
    return hash;
}

function intToRGB(i) {
    var index = i%TranslinkMap.BUS_COLORS.length;
    return TranslinkMap.BUS_COLORS[index];
}

function logger(type,title,message) {
	
	var parentNode = document.getElementById("console_text");
	var node = document.createElement("p");
	var divider = document.createElement("hr");
	var modalText = "";
	
	switch(type) {
		case "info":
			node.className = "text-info";
			if ((typeof title === 'string' || (title instanceof String)) && title.length > 0) {
				console.info(title);
			}
			console.info(message);
			break;
		case "warn":
			node.className = "text-warning";
			if ((typeof title === 'string' || (title instanceof String)) && title.length > 0) {
				console.warn(title);
			}
			console.warn(message);
			break;
		case "error":
			node.className = "text-danger";
			if ((typeof title === 'string' || (title instanceof String)) && title.length > 0) {
				console.error(title);
			}
			console.error(message);
			break;
		default:	
			node.className = "text-info";
			if ((typeof title === 'string' || (title instanceof String)) && title.length > 0) {
				console.info(title);
			}
			console.info(message);
			break;
	}
	
	if (typeof message !== 'string' && !(message instanceof String)) {
		try {
			message = JSON.stringify(message);
		} catch(e) {
			message = "Object:" + e.message;
		}
	}
	
	if ((typeof title === 'string' || (title instanceof String)) && title.length > 0) {
		modalText += "<strong>" + title + "</strong>\n";
	}
	modalText += message;
	node.innerHTML = modalText;
	parentNode.appendChild(node);
	parentNode.appendChild(divider);
}

// Create a new object, that prototypically inherits from the Error constructor
function xmlHttpError(obj) {
	this.error = obj;
}
xmlHttpError.prototype = Object.create(Error.prototype);
xmlHttpError.prototype.constructor = xmlHttpError;

/* 
 * Test area
 */

// Test gtfs live updates
/*
testXHR();
function testXHR() {
	// Trip updates
	var url = "http://gtfs.translink.ca/gtfsrealtime?apikey=E8VQ8lZxguRLWbi237f4";
	var params = "url="+encodeURIComponent(url)+"&type=gtfs_trip";
	// Position updates
	//var url = "http://gtfs.translink.ca/gtfsposition?apikey=E8VQ8lZxguRLWbi237f4";
	//var params = "url="+encodeURIComponent(url)+"&type=gtfs_position";
	var proxyUrl = "./proxy.php";


	var xhttp = new XMLHttpRequest();
	xhttp.open("POST", proxyUrl, true);
	xhttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
	xhttp.onreadystatechange = function() {
		if (xhttp.readyState == 4) {
			if (xhttp.status == 200) {
				logger("info","","gtfs data");
				logger("info","",xhttp.responseText);
			}
		}
	};
	xhttp.send(params);
}
*/