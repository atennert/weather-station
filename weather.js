const VENDOR_ID = 0x1941
const PRODUCT_ID = 0x8021
const INTERFACE = 0

const MAX_READ_TRIES = 3
const READ_BUFFER_SIZE = 32
const MESSAGE_SIZE = 8

const WS_ALL_ADDRESS = 0
const WS_PERIOD_ADDRESS = 16
const WS_DATA_COUNT_ADDRESS = 27
const WS_CURRENT_POSITION_ADDRESS = 30

const WS_ALL_SIZE = 256
const WS_PERIOD_SIZE = 1
const WS_DATA_COUNT_SIZE = 2
const WS_CURRENT_POSITION_SIZE = 2

const directions = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"
]
const directionsDeg = [
  0, 23, 45, 68, 90, 113, 135, 158,
  180, 203, 225, 248, 270, 293, 315, 338
]


class WeatherStation {
  /**
   * @param {HIDDevice} device
   */
  constructor(device) {
    this.device = device;
  }

  /**
   * @param {number} address
   * @param {number} size
   * @returns {Promise<Array<number>>}
   */
  async readData(address = WS_ALL_ADDRESS, size = WS_ALL_SIZE) {
    const readSize = Math.min(size, READ_BUFFER_SIZE)

    /** @type Array<number> */
    const completeBuffer = []

    for (let i = 0; i < size; i += readSize) {
      const data = await this.readDataPart(address + i, readSize);

      completeBuffer.push(...data)
    }
    return completeBuffer
  }

  /**
   * @param {number} partAddress
   * @param {number} readSize
   * @returns {Promise<Array<number>>}
   */
  async readDataPart(partAddress, readSize) {
    let message = [
      0b10100001,
      (partAddress >> 8) & 0xff,
      partAddress & 0xff,
      READ_BUFFER_SIZE,
      0b10100001,
      (partAddress >> 8) & 0xff,
      partAddress & 0xff,
      READ_BUFFER_SIZE,
    ];

    const dataPromise = new Promise((resolve) => {
      let requiredBytes = READ_BUFFER_SIZE
      /** @type Array<number> */
      const buffer = []

      /** @param {DataView} data */
      function receiver({data}) {
        requiredBytes -= data.byteLength
        for (let j = 0; j < data.byteLength; j++) {
          buffer.push(data.getUint8(j))
        }

        if (requiredBytes <= 0) {
          resolve(buffer.slice(0, readSize))
        }
      }

      this.device.oninputreport = receiver
    });

    await this.device.sendReport(0, new Uint8Array(message))
    return await dataPromise;
  }

  async close() {
    if (!this.device) {
      return;
    }

    await this.device.close();
    if ("forget" in HIDDevice.prototype) {
      await this.device.forget()
    }
    console.log("forgot the device")
    this.device = undefined
  }
}

/**
 * @param {Array<number>} data
 * @return {{
 * windDirectionCompass: string,
 * outsideTemperatureCelsius: number,
 * outsideHumidityPercent: number,
 * windSpeedKilometersPerHour: number,
 * illuminationLux: number,
 * uvLevel: number,
 * windGustKilometersPerHour: number,
 * windDirectionDegrees: number,
 * insideHumidityPercent: number,
 * airPressureHectoPascal: number,
 * insideTemperatureCelsius: number,
 * age: number,
 * rainMillimeter: number
 * }}
 */
function interpretWeatherData(data) {
  return {
    age: data[0],
    insideTemperatureCelsius: data[0x03] >= 0x80
      ? (data[0x02] + (data[0x03] << 8) ^ 0x7FFF) / 10
      : (data[0x02] + (data[0x03] << 8) ^ 0x0000) / 10,
    outsideTemperatureCelsius: data[0x06] >= 0x80
      ? (data[0x05] + (data[0x06] << 8) ^ 0x7FFF) / 10
      : (data[0x05] + (data[0x06] << 8) ^ 0x0000) / 10,
    insideHumidityPercent: data[0x01],
    outsideHumidityPercent: data[0x04],
    windSpeedKilometersPerHour: data[0x09] / 10 * 3.6,
    windGustKilometersPerHour: data[0x0A] / 10 * 3.6,
    windDirectionDegrees: directionsDeg[data[0x0C] < directionsDeg.length ? data[0x0C] : 0],
    windDirectionCompass: directions[data[0x0C] < directions.length ? data[0x0C] : 0],
    airPressureHectoPascal: (data[0x07] + (data[0x08] << 8)) / 10,
    rainMillimeter: (data[0x0D] + (data[0x0E] << 8)) * 0.3,
    uvLevel: data[19],
    illuminationLux: Math.floor((data[16] + (data[17] << 8) + (data[18] << 16)) * 0.1)
  }
}

/**
 * @param {{
 * windDirectionCompass: string,
 * outsideTemperatureCelsius: number,
 * outsideHumidityPercent: number,
 * windSpeedKilometersPerHour: number,
 * illuminationLux: number,
 * uvLevel: number,
 * windGustKilometersPerHour: number,
 * windDirectionDegrees: number,
 * insideHumidityPercent: number,
 * airPressureHectoPascal: number,
 * insideTemperatureCelsius: number,
 * age: number,
 * rainMillimeter: number
 * }} weatherData
 */
function updateUI(weatherData) {
  document.getElementById('air-pressure').textContent = weatherData.airPressureHectoPascal
  document.getElementById('illumination').textContent = weatherData.illuminationLux
  document.getElementById('inside-humidity').textContent = weatherData.insideHumidityPercent
  document.getElementById('outside-humidity').textContent = weatherData.outsideHumidityPercent
  document.getElementById('inside-temperature').textContent = weatherData.insideTemperatureCelsius
  document.getElementById('outside-temperature').textContent = weatherData.outsideTemperatureCelsius
  document.getElementById('rain').textContent = weatherData.rainMillimeter
  document.getElementById('uv-level').textContent = weatherData.uvLevel
  document.getElementById('wind-direction-compass').textContent = weatherData.windDirectionCompass
  document.getElementById('wind-direction-degrees').textContent = weatherData.windDirectionDegrees
  document.getElementById('wind-speed').textContent = weatherData.windSpeedKilometersPerHour
  document.getElementById('wind-gust').textContent = weatherData.windGustKilometersPerHour
}

/** @type WeatherStation */
let weatherStation

async function open(device) {
  if (!device) {
    document.getElementById('btn-connect').disabled = false
    return
  }

  if (!device.opened) {
    await device.open()
      .catch(console.error)
  }

  if (!device.opened) {
    return
  }
  document.getElementById('btn-connect').disabled = true

  weatherStation = new WeatherStation(device)

  document.getElementById('btn-request-data').disabled = false
  document.getElementById('btn-disconnect').disabled = false
  document.getElementById('chk-auto-refresh').disabled = false
}

async function connect() {
  if (!navigator.hid) {
    console.log("WebHID is not available")
  }

  const [device] = await navigator.hid.requestDevice({
    filters: [{
      vendorId: VENDOR_ID,
      productId: PRODUCT_ID
    }]
  })
    .catch(console.error)

  await open(device);
}

async function requestData() {
  const currentDataAddress = await weatherStation.readData(WS_CURRENT_POSITION_ADDRESS, 2)
  const data2 = await weatherStation.readData(currentDataAddress[0] + currentDataAddress[1] * 256, 0x14)

  updateUI(interpretWeatherData(data2))
}

/** @type number */
let refreshInterval

async function changeAutoRefresh() {
  if (document.getElementById('chk-auto-refresh').checked) {
    await requestData()
    refreshInterval = setInterval(() => requestData(), 30_000)
  } else {
    clearInterval(refreshInterval)
  }
}

async function disconnect() {
  await weatherStation.close()
  weatherStation = undefined

  document.getElementById('btn-connect').disabled = false
  document.getElementById('btn-request-data').disabled = true
  document.getElementById('btn-disconnect').disabled = true
  document.getElementById('chk-auto-refresh').disabled = true
}

navigator.hid.getDevices()
  .then(devices => {
    for (const device of devices) {
      if (device.productId === PRODUCT_ID && device.vendorId === VENDOR_ID) {
        return device
      }
    }
    return null
  })
  .then(device => open(device))
