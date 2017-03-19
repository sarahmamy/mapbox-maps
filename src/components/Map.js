import React, { Component } from 'react';
import {connect} from 'react-redux';
import mapboxgl from 'mapbox-gl/dist/mapbox-gl';
import turfBbox from '@turf/bbox';
import turfBboxPolygon from '@turf/bbox-polygon';
import turfBuffer from '@turf/buffer';
import turfDistance from '@turf/distance';
import {setZoom, setCenter, setStateValue, setUserLocation, getRoute} from '../actions/index'

class MapComponent extends Component {
  render() {
    return (
      <div id='map' className='viewport-full'>
      </div>
    );
  }

  componentDidMount() {
    mapboxgl.accessToken = this.props.accessToken;

    const map = new mapboxgl.Map({
        container: 'map',
        style: this.props.style,
        center: this.props.center,
        zoom: this.props.zoom,
        minZoom: 2,
        maxZoom: 21
    });

    this.map = map;

    map.on('moveend', () => {
      const center = map.getCenter();
      this.props.setCenter([center.lng, center.lat]);
      this.props.setZoom(map.getZoom());
    });

    map.on('load', () => {

      map.addSource('route', {
        type: 'geojson',
        data: this.emptyData
      });

      map.addSource('marker', {
        type: 'geojson',
        data: this.emptyData
      });

      map.addSource('geolocation', {
        type: 'geojson',
        data: this.emptyData
      });

      map.addSource('fromMarker', {
        type: 'geojson',
        data: this.emptyData
      });


      // Route style
      map.addLayer({
        'id': 'route',
        'source': 'route',
        'type': 'line',
        'paint': {
          'line-color': '#2abaf7',
          'line-width': 5.5
        },
        'layout': {
          'line-join': 'round',
          'line-cap': 'round'
        },
      }, 'bridge-oneway-arrows-white');
      map.addLayer({
        'id': 'route-casing',
        'source': 'route',
        'type': 'line',
        'paint': {
          'line-color': '#2779b5',
          'line-width': 6.5
        },
        'layout': {
          'line-join': 'round',
          'line-cap': 'round'
        },
      }, 'route');

      // Marker style
      map.addLayer({
        'id': 'marker',
        'source': 'marker',
        'type': 'symbol',
        'layout': {
          'icon-image': 'pin',
          'icon-offset': [0, -20]
        },
      });

      map.addLayer({
        'id': 'fromMarker',
        'source': 'fromMarker',
        'type': 'symbol',
        'layout': {
          'icon-image': 'fromLocation'
        },
      }, 'marker');

      map.addLayer({
        'id': 'geolocation',
        'source': 'geolocation',
        'type': 'symbol',
        'layout': {
          'icon-image': 'geolocation'
        },
      }, 'fromMarker');

      // helper to set geolocation
      const setGeolocation = (data) => {
        const geometry = {type: 'Point', coordinates: [data.coords.longitude, data.coords.latitude]};
        this.map.getSource('geolocation').setData(geometry);
        this.props.setUserLocation(geometry.coordinates);
        this.moveTo(geometry, 13);
      }

      // Create geolocation control
      const geolocateControl = new mapboxgl.GeolocateControl();
      geolocateControl.on('geolocate', setGeolocation);
      map.addControl(geolocateControl, 'bottom-right');

      // Initial ask for location and display on the map
      if (this.props.userLocation) {
        this.map.getSource('geolocation').setData(this.props.userLocation.geometry);
        this.moveTo(this.props.userLocation, 13);
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(setGeolocation);
      }

      // Regularly poll the user location and update the map
      window.setInterval(() => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition((data) => {
            const geometry = {type: 'Point', coordinates: [data.coords.longitude, data.coords.latitude]};
            this.map.getSource('geolocation').setData(geometry);
            this.props.setUserLocation(geometry.coordinates);
          });
        }
      }, 10000);

    });
  }

  componentDidUpdate() {
    if (!this.props.needMapUpdate) return;

    // Search mode
    if (this.props.mode === 'search') {
      if (this.props.searchLocation) {
        this.map.getSource('marker').setData(this.props.searchLocation.geometry);
      } else {
        this.map.getSource('marker').setData(this.emptyData);
      }

      // remove items specific to directions mode
      this.map.getSource('fromMarker').setData(this.emptyData);
      this.map.getSource('route').setData(this.emptyData);
    }

    // Directions mode
    if (this.props.mode === 'directions') {
      if (this.props.directionsFrom) {
        this.map.getSource('fromMarker').setData(this.props.directionsFrom.geometry);
      } else {
        this.map.getSource('fromMarker').setData(this.emptyData);
      }

      if (this.props.directionsTo) {
        this.map.getSource('marker').setData(this.props.directionsTo.geometry);
      } else {
        this.map.getSource('marker').setData(this.emptyData);
      }

      if (this.props.route) {
        this.map.getSource('route').setData(this.props.route.geometry);
      } else {
        this.map.getSource('route').setData(this.emptyData);
      }

      // We have origin and destination but no route yet
      if (this.props.directionsFrom && this.props.directionsTo && !this.props.route) {
        // Do not retry when the previous request errored
        if (this.props.routeStatus !== 'error') {
          // Trigger the API call to directions
          this.props.getRoute(
            this.props.directionsFrom,
            this.props.directionsTo,
            this.props.modality,
            this.props.accessToken
          );
        }
      }
    }

    if (this.props.needMapRepan) {
      // Search mode
      if (this.props.mode === 'search') {
        this.moveTo(this.props.searchLocation);
      }

      // Directions mode
      if (this.props.mode === 'directions') {
        if (this.props.route) {
          const bbox = turfBbox(this.props.route.geometry);
          this.moveTo({bbox: bbox});

        } else if (this.props.directionsTo && this.props.directionsFrom) {
          const bbox = turfBbox({
            type: 'FeatureCollection',
            features: [this.props.directionsFrom, this.props.directionsTo]
          });
          this.moveTo({bbox: bbox});

        } else {
          // Whichever exists
          this.moveTo(this.props.directionsTo);
          this.moveTo(this.props.directionsFrom);
        }
      }
    }

    this.props.setStateValue('needMapUpdate', false);
    this.props.setStateValue('needMapRepan', false);
  }

  moveTo(location, zoom) {
    if (!location) return;
    if (location.bbox) { // We have a bbox to fit to
      const distance = turfDistance([location.bbox[0], location.bbox[1]], [location.bbox[2], location.bbox[3]]);
      const buffered = turfBuffer(turfBboxPolygon(location.bbox), distance / 2, 'kilometers');
      const bbox = turfBbox(buffered);
      try {
        this.map.fitBounds(bbox, {linear: true});
      } catch (e) {
        this.map.fitBounds(location.bbox, {linear: true});
      }
    } else { // We just have a point
      this.map.easeTo({
        center: location.geometry.coordinates,
        zoom: zoom || 16
      });
    }
  }

  get emptyData() {
    return {
      type: 'FeatureCollection',
      features: []
    };
  }

}

MapComponent.propTypes = {
  accessToken: React.PropTypes.string,
  style: React.PropTypes.string,
  center: React.PropTypes.array,
  zoom: React.PropTypes.number,
  setCenter: React.PropTypes.func,
  setZoom: React.PropTypes.func,
  map: React.PropTypes.object,
  mode: React.PropTypes.string,
  route: React.PropTypes.object,
  userLocation: React.PropTypes.object,
  routeStatus: React.PropTypes.string,
  searchLocation: React.PropTypes.object,
  directionsFrom: React.PropTypes.object,
  directionsTo: React.PropTypes.object,
  modality: React.PropTypes.string,
  needMapUpdate: React.PropTypes.bool,
  needMapRepan: React.PropTypes.bool,
  setStateValue: React.PropTypes.func,
  setUserLocation: React.PropTypes.func,
  getRoute: React.PropTypes.func
}

const mapStateToProps = (state) => {
  return {
    accessToken: state.mapboxAccessToken,
    style: state.mapStyle,
    center: state.mapCenter,
    zoom: state.mapZoom,
    searchLocation: state.searchLocation,
    directionsFrom: state.directionsFrom,
    directionsTo: state.directionsTo,
    userLocation: state.userLocation,
    modality: state.modality,
    mode: state.mode,
    needMapUpdate: state.needMapUpdate,
    needMapRepan: state.needMapRepan,
    route: state.route,
    routeStatus: state.routeStatus
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    setCenter: (coordinates) => dispatch(setCenter(coordinates)),
    setZoom: (zoom) => dispatch(setZoom(zoom)),
    setStateValue: (key, value) => dispatch(setStateValue(key, value)),
    setUserLocation: (coordinates) => dispatch(setUserLocation(coordinates)),
    getRoute: (directionsFrom, directionsTo, modality, accessToken) => dispatch(getRoute(directionsFrom, directionsTo, modality, accessToken))
  };
};

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(MapComponent);
