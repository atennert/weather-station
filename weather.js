const VENDOR_ID = 0x1941
const PRODUCT_ID = 0x8021
const INTERFACE = 0

const MAX_READ_TRIES = 3
const READ_BUFFER_SIZE = 32
const MESSAGE_SIZE = 8
const WS_ENTRY_SIZE = 0x14
const MAX_WS_ENTRY_COUNT = 3264

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
    this.device = device
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
      const data = await this.readDataPart(address + i, readSize)

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
    ]

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
    })

    await this.device.sendReport(0, new Uint8Array(message))
    return await dataPromise
  }

  async close() {
    if (!this.device) {
      return
    }

    await this.device.close()
    if ("forget" in HIDDevice.prototype) {
      await this.device.forget()
    }
    console.log("forgot the device")
    this.device = undefined
  }
}

/**
 * @param {Array<number>} data
 * @param {Array<number>} data60Min
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
 * ageMinutes: number,
 * rainMillimeter1h: number
 * }}
 */
function interpretWeatherData(data, data60Min) {
  return {
    ageMinutes: data[0],
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
    rainMillimeter1h: ((data[0x0D] + (data[0x0E] << 8)) - (data60Min[0x0D] + (data60Min[0x0E] << 8))) * 0.3,
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
 * ageMinutes: number,
 * rainMillimeter1h: number
 * }} weatherData
 */
function updateUI(weatherData) {
  document.getElementById('air-pressure').value = weatherData.airPressureHectoPascal
  document.getElementById('illumination').value = weatherData.illuminationLux
  document.getElementById('inside-humidity').value = weatherData.insideHumidityPercent
  document.getElementById('outside-humidity').value = weatherData.outsideHumidityPercent
  document.getElementById('inside-temperature').value = weatherData.insideTemperatureCelsius
  document.getElementById('outside-temperature').value = weatherData.outsideTemperatureCelsius
  document.getElementById('rain').value = weatherData.rainMillimeter1h
  document.getElementById('uv-level').value = weatherData.uvLevel
  document.getElementById('wind-speed').textContent = weatherData.windSpeedKilometersPerHour.toFixed(1)
  document.querySelectorAll('polygon')
    .forEach(p => p.classList.remove('current-direction'))
  document.getElementById(`p${weatherData.windDirectionDegrees}`).classList.add('current-direction')
  document.getElementById('windDescription').textContent =
    `The current wind direction is ${weatherData.windDirectionCompass} with a speed of ${weatherData.windSpeedKilometersPerHour.toFixed(1)} km/h.`
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
    return
  }

  const [device] = await navigator.hid.requestDevice({
    filters: [{
      vendorId: VENDOR_ID,
      productId: PRODUCT_ID
    }]
  })
    .catch(console.error)

  await open(device)
}

function get60MinutesAgoAddress(lastAgeMinutes, readPeriodMinutes, dataCount, currentDataAddress) {
  let position60Min = Math.round((60 - lastAgeMinutes) / readPeriodMinutes)
  if (dataCount <= position60Min) {
    position60Min = dataCount - 1
  }
  let address60Min = currentDataAddress - position60Min * WS_ENTRY_SIZE

  if (address60Min < WS_ALL_ADDRESS) {
    address60Min += MAX_WS_ENTRY_COUNT * WS_ENTRY_SIZE
  }
  return address60Min
}

async function requestData() {
  const [readPeriodMinutes] = await weatherStation.readData(WS_PERIOD_ADDRESS, WS_PERIOD_SIZE)
  const dataCount = await weatherStation.readData(WS_DATA_COUNT_ADDRESS, WS_DATA_COUNT_SIZE)
    .then(([dc1, dc2]) => dc1 + dc2 * 256)
  const currentDataAddress = await weatherStation.readData(WS_CURRENT_POSITION_ADDRESS, WS_CURRENT_POSITION_SIZE)
    .then(address => address[0] + address[1] * 256)
  const data = await weatherStation.readData(currentDataAddress, WS_ENTRY_SIZE)
  const lastAgeMinutes = data[0]
  const address60Min = get60MinutesAgoAddress(lastAgeMinutes, readPeriodMinutes, dataCount, currentDataAddress)
  const data60Min = await weatherStation.readData(address60Min, WS_ENTRY_SIZE)

  updateUI(interpretWeatherData(data, data60Min))
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
  document.getElementById('chk-auto-refresh').checked = false
  document.getElementById('chk-auto-refresh').disabled = true
}

if (!navigator.hid) {
  document.querySelector('.warn__hid-not-available').style.display = 'block'
  document.querySelector('.controls').style.display = 'none'
} else {
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
}

