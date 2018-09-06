/*
 * @Description: 用于动态添加polygon的label
 * @Author: b-junsong@163.com
 * @Date: 2018-08-29 16:05:42
 * @Last Modified time: 2018-09-06 16:21:59
 */

import { FeatureCollection, Feature } from 'geojson';
import polylabel from 'polylabel';
import { Map as mapboxMap, LngLat, GeoJSONSource } from 'mapbox-gl';
import turf from 'turf';

/**
 * 动态添加label
 * @param map map object
 * @param layerId 需要添加label的layer id
 * @param field 当做label的field name
 */
export const dyLabels = (map: mapboxMap, layerId: string, field: string): void => {

  if (map.getLayer('label-layer') !== undefined) {
    map.removeLayer('label-layer').removeSource('label-layer');
  }
  const labelPointFeatures: FeatureCollection = {
    type: 'FeatureCollection',
    features: [],
  };

  map.addLayer({
    id: 'label-layer',
    type: 'symbol',
    source: {
      type: 'geojson',
      data: labelPointFeatures,
    },
    layout: {
      'text-field': `{${field}}`, // 字段名称
      'text-font': ['Arial Unicode MS Regular'],
      'text-size': 11,
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.05,
      'text-offset': [0, 1.5],
    },
    paint: {
      'text-color': '#202',
      'text-halo-color': '#fff',
      'text-halo-width': 2,
    },
  });

  const renderFeatures: Feature[] = map.queryRenderedFeatures(undefined, {
    layers: [layerId],
  });
  // console.info('renderFeatures', renderFeatures);
  if (renderFeatures.length === 0) {
    return;
  }
  const mapSW: LngLat = map.getBounds().getSouthWest();
  const mapNE: LngLat = map.getBounds().getNorthEast();

  const mapViewBound = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [mapSW.lng, mapSW.lat],
          [mapSW.lng, mapNE.lat],
          [mapNE.lng, mapNE.lat],
          [mapNE.lng, mapSW.lat],
          [mapSW.lng, mapSW.lat],
        ],
      ],
    },
  };
  const visualCenterList: any[] = [];
  const fixedLabelFilter: string[] = ['!in', `${field}`];

  const neighborhoods: any = groupBy(renderFeatures, nbhdFeature => nbhdFeature.properties[`${field}`]);
  // console.info('neighborhoods', neighborhoods);

  neighborhoods.forEach((value: any[], key: string) => {
    const centroGeo = turf.centroid(value[0]);
    const lngOfCentroid = centroGeo.geometry.coordinates[0];
    const latOfCentroid = centroGeo.geometry.coordinates[1];
    // tslint:disable-next-line:early-exit
    if (lngOfCentroid <= mapSW.lng || lngOfCentroid >= mapNE.lng
      || latOfCentroid <= mapSW.lat || latOfCentroid >= mapNE.lat) {
      fixedLabelFilter.push(key);
      // console.log(key);
    }
    const visualCenter = value.map((obj: any) => getVisualCenter(obj, mapViewBound, field));
    if (cleanArray(visualCenter).length) {
      visualCenterList.push(cleanArray(visualCenter));
    }
  });
  // console.info('visualCenterList', visualCenterList);
  visualCenterList.map(obj => {
    const coordinatesList: any[] = [];
    obj.forEach((feature: any) => {
      coordinatesList.push(feature.geometry.coordinates);
    });
    const center: any[] = getCenter(coordinatesList);
    const neighborhoodCenterFeature: any = {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: center,
      },
      properties: {},
    };
    neighborhoodCenterFeature.properties[field] = obj[0].properties[`${field}`];
    labelPointFeatures.features.push(neighborhoodCenterFeature);
  });

  map.setFilter('label-layer', fixedLabelFilter);
  (map.getSource('label-layer') as GeoJSONSource).setData(labelPointFeatures);
};

const groupBy = (list: any[], keyGetter: (e: any) => void) => {
  const map = new Map();
  list.forEach((item) => {
    const key = keyGetter(item);
    const collection = map.get(key);
    if (!collection) {
      map.set(key, [item]);
    } else {
      collection.push(item);
    }
  });
  return map;
};

// get visual center
const getVisualCenter = (feature: any, mapViewBound: any, field: string) => {
  if (feature.geometry.type !== 'Polygon') {
    return;
  }
  let intersection: any;
  try {
    intersection = turf.intersect(mapViewBound, feature);
  } catch (error) {
    return;
  }
  if (!intersection) {
    return;
  }
  const visualCenter: any = {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [],
    },
    properties: {},
  };
  if (intersection.geometry.coordinates.length > 1) {
    const intersections: any[] = [];
    intersection.geometry.coordinates.forEach((coordinate: any) => {
      intersections.push(polylabel(coordinate));
    });
    // tslint:disable-next-line:no-string-literal
    visualCenter.geometry.coordinates = getCenter(intersections);
  } else {
    visualCenter.geometry.coordinates = polylabel(intersection.geometry.coordinates);
  }
  visualCenter.properties[`${field}`] = feature.properties[`${field}`];
  return visualCenter;
};

// get the center of a coordinates list
const getCenter = (coordinates: any[]): any[] => {
  const lngList: number[] = [];
  const latList: number[] = [];
  coordinates.map(coordinate => {
    lngList.push(coordinate[0]);
    latList.push(coordinate[1]);
  });
  const meanLng = lngList.reduce((p, c) => p + c, 0) / lngList.length;
  const meanLat = latList.reduce((p, c) => p + c, 0) / latList.length;
  return [meanLng, meanLat];
};

const cleanArray = (array: any[]) => {
  for (let i = 0; i < array.length; i++) {
    if (!array[i]) {
      array.splice(i, 1);
      i--;
    }
  }
  return array;
};
