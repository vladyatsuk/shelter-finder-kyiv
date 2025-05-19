import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

const map = createMap();

map.fitBounds(KYIV_BOUNDS);
