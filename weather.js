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

    for (let i=0; i<size; i+=readSize) {
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
 * @return {{outsideTemperature: string, absolutePressure: string, uvLevel: *, rain: string, illumination: string, insideTemperature: string, windGust: string, outsideHumidity: string, windDirection: string, insideHumidity: string, windSpeed: string, age: *}}
 */
function interpretWeatherData(data) {
  return {
    age: data[0],
    insideTemperature: (data[0x03] >= 0x80
      ? (data[0x02] + (data[0x03] << 8) ^ 0x7FFF) / 10
      : (data[0x02] + (data[0x03] << 8) ^ 0x0000) / 10) + ' °C',
    outsideTemperature: (data[0x06] >= 0x80
      ? (data[0x05] + (data[0x06] << 8) ^ 0x7FFF) / 10
      : (data[0x05] + (data[0x06] << 8) ^ 0x0000) / 10) + ' °C',
    insideHumidity: data[0x01] + ' %',
    outsideHumidity: data[0x04] + ' %',
    windSpeed: (data[0x09] / 10 * 3.6) + ' km/h',
    windGust: (data[0x0A] / 10 * 3.6) + ' km/h',
    windDirection: directionsDeg[data[0x0C] < directionsDeg.length ? data[0x0C] : 0] + '° (' + directions[data[0x0C] < directions.length ? data[0x0C] : 0] + ')',
    absolutePressure: ((data[0x07] + (data[0x08] << 8)) / 10) + " hPa",
    rain: ((data[0x0D] + (data[0x0E] << 8)) * 0.3) + " mm",
    uvLevel: data[19],
    illumination: Math.floor((data[16] + (data[17] << 8) + ( data[18] << 16)) * 0.1) + " lux"
  }
}

/** @type WeatherStation */
let weatherStation

async function connect() {
  if (!navigator.hid) {
    console.log("USB is not available")
  }

  const [device] = await navigator.hid.requestDevice({
    filters: [{
      vendorId: VENDOR_ID,
      productId: PRODUCT_ID
    }]
  })
    .catch(console.error)

  if (!device) {
    return;
  }
  console.log(device)

  if (!device.opened) {
    await device.open()
      .catch(console.error)
  }

  weatherStation = new WeatherStation(device)
}

async function requestData() {
  const currentDataAddress = await weatherStation.readData(WS_CURRENT_POSITION_ADDRESS, 2)
  const data2 = await weatherStation.readData(currentDataAddress[0] + currentDataAddress[1] * 256, 0x14)

  console.log('data', interpretWeatherData(data2))
}

async function disconnect() {
  await weatherStation.close()
  weatherStation = undefined
}
