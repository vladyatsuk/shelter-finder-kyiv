import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster';

const createMap = () => {
  const map = L.map('map', { preferCanvas: true });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  return map;
};

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

const loadShelters = async () => {
  const cached = localStorage.getItem(STORAGE_KEY);

  if (cached) {
    return JSON.parse(cached);
  }

  const res = await fetch(API_URL);
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

const map = createMap();

map.fitBounds(KYIV_BOUNDS);

const shelters = await loadShelters();
const markersCluster = createCluster(shelters);

markersCluster.addTo(map);
