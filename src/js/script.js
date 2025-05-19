import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';

import KDBush from 'kdbush';
import { around } from 'geokdbush';

const KYIV_BOUNDS = L.latLngBounds(
  L.latLng(50.299496341000065, 30.245271611000078),
  L.latLng(50.56875271300004, 30.724170000000072),
);

const API_URL = 'https://gisserver.kyivcity.gov.ua/mayno/rest/services/KYIV_API/%D0%9A%D0%B8%D1%97%D0%B2_%D0%A6%D0%B8%D1%84%D1%80%D0%BE%D0%B2%D0%B8%D0%B9/MapServer/0/query?where=1%3D1&text=&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&distance=&units=esriSRUnit_Foot&relationParam=&outFields=*&returnGeometry=true&returnTrueCurves=false&maxAllowableOffset=&geometryPrecision=&outSR=4326&havingClause=&returnIdsOnly=false&returnCountOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&gdbVersion=&historicMoment=&returnDistinctValues=false&resultOffset=&resultRecordCount=&returnExtentOnly=false&datumTransformation=&parameterValues=&rangeValues=&quantizationParameters=&featureEncoding=esriDefault&f=pjson';
const STORAGE_KEY = 'shelters';
const SHELTER_ICON_URL = '/icons/shelter.svg';

const SHELTER_ICON = L.icon({
  iconUrl: SHELTER_ICON_URL,
  iconSize: [24, 24],
});

const RADIUS_METERS = 2000;
const NEARBY_SHELTERS_COUNT = 10;

const createMap = () => {
  const map = L.map('map', { preferCanvas: true });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  return map;
};

const loadShelters = async () => {
  const cached = localStorage.getItem(STORAGE_KEY);

  if (cached) {
    return JSON.parse(cached);
  }

  try {
    const res = await fetch(API_URL);

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    const data = await res.json();
    const seen = new Set();

    const shelters = data.features
      .map(({ attributes }) => ({
        lat: Number(attributes.lat.toFixed(6)),
        lng: Number(attributes.long.toFixed(6)),
        district: attributes.district,
        address: attributes.address,
        kind: attributes.kind,
        typeBuilding: attributes.type_building,
        tel: attributes.tel,
        invalid: attributes.invalid,
        description: attributes.description,
        phonenumb: attributes.phonenumb,
        title: attributes.title,
        linkFull: attributes.link_full,
        workingTime: attributes.working_time,
      }))
      .filter(({ lat, lng }) => {
        const coordKey = `${lat},${lng}`;

        if (seen.has(coordKey)) return false;

        seen.add(coordKey);

        return true;
      });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(shelters));

    return shelters;
  }
  catch (error) {
    console.error('Error loading shelters:', error);

    return [];
  }
};

const createShelterMarker = (shelter) => {
  const location = L.latLng(shelter.lat, shelter.lng);

  const destination = `${shelter.lat},${shelter.lng}`;
  const encodedDestination = encodeURIComponent(destination);
  const baseUrl = 'https://www.google.com/maps/dir/?api=1';
  const fullUrl = `${baseUrl}&destination=${encodedDestination}&travelmode=walking&dir_action=navigate`;

  const popupContent = [
    `<strong>${shelter.title}</strong>`,
    `<b>Адреса:</b> ${shelter.address}`,
    `<b>Район:</b> ${shelter.district}`,
    `<b>Тип будівлі:</b> ${shelter.typeBuilding}`,
    `<b>Вид:</b> ${shelter.kind}`,
    `<b>Координати:</b> ${shelter.lat}, ${shelter.lng}`,
    `<b>Телефон:</b> ${shelter.tel || shelter.phonenumb || '-'}`,
    `<b>Доступність для людей з інвалідністю:</b> ${shelter.invalid}`,
    `<b>Опис:</b> ${shelter.description}`,
    `<b>Час роботи:</b> ${shelter.workingTime}`,
    `${shelter.linkFull}`,
    `<a target="_blank" href="${fullUrl}" rel="noopener noreferrer">Навігація в Google Maps</a>`,
  ].join('<br>');

  return L.marker(location, { icon: SHELTER_ICON })
    .bindPopup(popupContent);
};

const createShelterMarkers = (shelters) =>
  shelters.map(createShelterMarker);

const createClusterElement = (cluster) => {
  const container = document.createElement('div');
  const icon = document.createElement('img');
  const count = document.createElement('div');

  container.classList.add('shelter-cluster');
  icon.src = SHELTER_ICON_URL;
  icon.classList.add('shelter-icon');
  count.classList.add('shelter-count');
  count.textContent = `${cluster.getChildCount()}`;

  container.appendChild(icon);
  container.appendChild(count);

  return container;
};

const createCluster = (shelters) => {
  const markers = createShelterMarkers(shelters);

  const clusterGroup = L.markerClusterGroup({
    disableClusteringAtZoom: 14,
    maxClusterRadius: 80,
    iconCreateFunction(cluster) {
      return L.divIcon({
        html: createClusterElement(cluster),
        className: '',
      });
    },
  });

  clusterGroup.addLayers(markers);

  return clusterGroup;
};

const createShelterIndex = (shelters) => {
  const index = new KDBush(shelters.length);

  for (const { lat, lng } of shelters) index.add(lng, lat);
  index.finish();

  return index;
};

const getCurrentPosition = () => new Promise((resolve, reject) => {
  navigator.geolocation.getCurrentPosition(
    (pos) => resolve(L.latLng(pos.coords.latitude, pos.coords.longitude)),
    (err) => {
      reject(new Error(`Geolocation failed: ${err.message}`));
    },
  );
});

const findShortestRoute = async (source, shelters) => {
  try {
    const baseUrl = 'https://routing.openstreetmap.de/routed-foot/table/v1/driving';
    const sourceCoords = `${source.lng},${source.lat}`;
    const destCoords = shelters.map(({ lng, lat }) => `${lng},${lat}`).join(';');
    const sourceIndex = 0;
    const destIndexes = shelters.map((_, i) => i + 1).join(';');
    const fullUrl = `${baseUrl}/${sourceCoords};${destCoords}?sources=${sourceIndex}&destinations=${destIndexes}`;

    const response = await fetch(fullUrl);

    if (!response.ok) {
      throw new Error(`Routing API error: ${response.status}`);
    }

    const data = await response.json();
    const durations = data.durations[0];

    const minIndex = durations.reduce(
      (minIdx, duration, idx, arr) =>
        duration < arr[minIdx] ? idx : minIdx,
      0,
    );

    const [lng, lat] = data.destinations[minIndex].location;

    return L.latLng(lat, lng);
  }
  catch (error) {
    console.error('Error finding shortest route:', error);
    throw error;
  }
};

const createRouteControl = (waypoints) => {
  const itineraryOptions = {
    collapsible: true,
    formatter: L.routing.formatter({
      unitNames: {
        meters: 'м',
        kilometers: 'км',
        hours: 'год',
        minutes: 'хв',
        seconds: 'с',
      },
    }),
  };

  const lineOptions = { addWaypoints: false };

  const plan = L.Routing.plan(waypoints, {
    createMarker() {
      return null;
    },
    addWaypoints: false,
    draggableWaypoints: false,
    routeWhileDragging: false,
  });

  return L.Routing.control({
    ...itineraryOptions,
    lineOptions,
    waypoints,
    plan,
    showAlternatives: false,
    router: L.Routing.osrmv1({
      serviceUrl: 'https://routing.openstreetmap.de/routed-foot/route/v1/',
      language: 'uk',
    }),
    routingOptions: { alternatives: false },
  });
};

class RouteNavigator {
  route;
  marker;
  instructionIndex;

  constructor(route, marker, pos) {
    this.route = route;
    this.marker = marker;
    this.instructionIndex = 0;

    this.updatePosition(pos);
  }

  speak(text) {
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    utterance.lang = 'uk-UA';
    utterance.rate = 1.25;
    speechSynthesis.speak(utterance);
  }

  updatePosition(pos) {
    this.marker.setLatLng(pos);

    const { instructions, coordinates } = this.route;

    if (this.instructionIndex >= instructions.length) return;

    const instruction = instructions[this.instructionIndex];
    const coord = coordinates[instruction.index] || coordinates[0];
    const instructionLatLng = L.latLng(coord.lat, coord.lng);

    const distance = pos.distanceTo(instructionLatLng);

    console.log(`Distance to instruction ${this.instructionIndex}: ${distance.toFixed(2)} m`);

    if (distance < 15) {
      this.speak(instruction.text);
      this.instructionIndex += 1;
    }
  }
}

const simulatePosition = (routeNavigator, positions, interval = 2000) => {
  let index = 0;

  const intervalId = setInterval(() => {
    if (index >= positions.length) {
      clearInterval(intervalId);

      return;
    }

    const pos = positions[index];
    const latlng = L.latLng(pos.lat, pos.lng);

    console.log(`Debug move to: { lat: ${pos.lat.toFixed(6)}, lng: ${pos.lng.toFixed(6)} }`);

    routeNavigator.updatePosition(latlng);
    index += 1;
  }, interval);
};

const map = createMap();

map.fitBounds(KYIV_BOUNDS);

const shelters = await loadShelters();
const markersCluster = createCluster(shelters);

markersCluster.addTo(map);

const shelterIndex = createShelterIndex(shelters);

try {
  const userLatLng = await getCurrentPosition();

  const userMarker = L.circleMarker(userLatLng, {
    radius: 8,
    color: '#3b67f8',
    fillOpacity: 1,
  });

  userMarker.addTo(map);

  map.setView(userLatLng, 16);

  const nearbyShelterIds = around(
    shelterIndex,
    userLatLng.lng,
    userLatLng.lat,
    NEARBY_SHELTERS_COUNT,
    RADIUS_METERS / 1000,
  );

  const nearbyShelters = nearbyShelterIds.map((i) => shelters[i]);

  try {
    const closestShelterLatLng =
      await findShortestRoute(userLatLng, nearbyShelters);

    const waypoints = [userLatLng, closestShelterLatLng];
    const routeControl = createRouteControl(waypoints);

    routeControl.addTo(map);

    routeControl.on('routesfound', (e) => {
      const fastestRoute = e.routes[0];

      const routeNavigator = new RouteNavigator(
        fastestRoute,
        userMarker,
        userLatLng,
      );

      if (new URLSearchParams(window.location.search).get('debug') === 'true') {
        map.on('click', (e) => {
          const pos = e.latlng;

          console.log(`{ lat: ${pos.lat.toFixed(6)}, lng: ${pos.lng.toFixed(6)} }`);

          routeNavigator.updatePosition(pos);
        });

        simulatePosition(routeNavigator, fastestRoute.coordinates, 1000);
      }
      else {
        const watchId = navigator.geolocation.watchPosition(
          (pos) => {
            const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);

            routeNavigator.updatePosition(latlng);
          },
          (err) => {
            console.error('Geolocation watchPosition error:', err);
          },
          {
            enableHighAccuracy: true,
            maximumAge: 10000,
            timeout: 10000,
          },
        );
      }
    });
  }
  catch (error) {
    console.log('Could not determine closest shelter route:', error);
  }
}
catch (error) {
  console.error(error);
}
