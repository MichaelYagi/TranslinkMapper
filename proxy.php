<?php

/*
 * See: https://developers.google.com/transit/gtfs-realtime/examples/php-sample
 * Run: composer update
require_once 'vendor/autoload.php';
use transit_realtime\FeedMessage;
*/
		
if ((isset($_POST["type"]) || isset($_GET["type"])) && (isset($_POST["url"]) || isset($_GET["url"]))) {
	$url = isset($_POST["url"]) ? $_POST["url"] : $_GET["url"];
	$url = urldecode($url);
	$type = isset($_POST["type"]) ? $_POST["type"] : $_GET["type"];
	$response = "Empty response";
	
	if (($type === "tlm_api" || $type === "tlm_stop_api") && strlen($url) > 0) {
		$urls = Array();
		$urls = explode("|",$url);
	
        $headers = array();
        $headers[] = 'accept: application/JSON';

        // define options
        $optArray = array(
            CURLOPT_URL => $urls[0],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers
        );

        $ch = curl_init();

        // apply those options
        curl_setopt_array($ch, $optArray);

        $response = curl_exec($ch);

		/*
		 * TODO: Include schedule information in the object
		if ($type === "tlm_stop_api") {
			$stopEstimateUrl = $urls[1];
			$stops = json_decode($response,true);

			foreach($stops as $stop) {
				$stopNo = $stop["StopNo"];
				//Replace __STOPNO__ with $stopNo in the url
				str_replace("__STOPNO__",$stopNo,$stopEstimateUrl);
				
			}
		}
		*/
		
        curl_close($ch);
   	/* 
	} else if ($type === "gtfs_trip" || $type === "gtfs_position") {
		$data = file_get_contents($url);
		
		$feed = new FeedMessage();
		$feed->parse($data);
		$testReturnStr = null;
		$retArr = null;
		foreach ($feed->getEntityList() as $entity) {
			// Get live transit data
			if ($entity->hasTripUpdate() || $entity->hasVehicle()) {
				$retBody = Array();

				if ($type === "gtfs_trip") {
					$data = $entity->getTripUpdate();
				} else {
					$data = $entity->getVehicle();
				}

                if ($data->hasVehicle()) {
					
					$positionArr["lat"] = NULL;
					$positionArr["lng"] = NULL;
					if ($entity->hasVehicle()) {
						$position = $entity->getVehicle()->getPosition();
						$positionArr = Array(
							"lat" => $position->getLatitude(),
							"lng" => $position->getLongitude()
						);
					}
                    $retBody["position"] = $positionArr; 

                    $trip = $data->getTrip();
                    $tripArr = Array(
                        "id" => $trip->getTripId(),
                        "route" => $trip->getRouteId()
                    );
                    $retBody["trip"] = $tripArr;

					$stopUpdateArr = Array();
					if ($data->hasStopTimeUpdate()) {
						$stopUpdates = $data->getStopTimeUpdateList();
						foreach ($stopUpdates as $stopUpdate) {
							// In seconds
							$stop["arrival"]["delay"] = NULL;
							$stop["arrival"]["time"] = NULL;
							if ($stopUpdate->hasArrival()) {
								$stop["arrival"]["delay"] = $stopUpdate->getArrival()->hasDelay() ? $stopUpdate->getArrival()->getDelay() : NULL;
								$stop["arrival"]["time"] = $stopUpdate->getArrival()->hasTime() ? $stopUpdate->getArrival()->getTime() : NULL;
							}

							$stop["departure"]["delay"] = NULL;
							$stop["departure"]["time"] = NULL;
							if ($stopUpdate->hasDeparture()) {
								$stop["departure"]["delay"] = $stopUpdate->getDeparture()->hasDelay() ? $stopUpdate->getDeparture()->getDelay() : NULL;
								$stop["departure"]["time"] = $stopUpdate->getDeparture()->hasTime() ? $stopUpdate->getDeparture()->getTime() : NULL;
							}

							$stopUpdateArr["id"] = $stopUpdate->getStopId();
							$stopUpdateArr["stopDetails"] = $stop;
						}
					}	
                    $retBody["stopUpdates"] = $stopUpdateArr;

                    $retArr[$data->getVehicle()->getId()] = $retBody;
                }
				//break;
			}
		}
		$response = var_export($retArr,true);
   	    */
	}
	
	echo $response;
} else {
	echo "Query empty";
}
exit();