const assert = require('assert')
const ehLog  = require( '../app/eh-logs' )

describe( 'Log Pattern Parser', () => {

  before(() => {
    ehLog.init(
      { msgCnt: 0, errCnt: 0, bannedIPs: {} }, 
      { nogoPatterns: '' }
    )
    process.env.LOG_LEVEL = 'TRACE'
  })

  it( 'parse normal logs', () => {
    let record = {
      LogEntry: '18.14.85.143 - [18.14.85.143] - - [10/Nov/2020:07:31:20 +0000] "GET /icons.svg HTTP/2.0" 200 9068 "https://somepage.com/orders" "Mozilla/5.0 (Macintosh  Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.183 Safari/537.36" 36 0.002 [frontend-80] 10.244.1.164:80 27158 0.004 200 0b354a3c3860bb5239c48a3b6f2028eb'
    }
    let logDta  = ehLog.checkAndParseAccessLog( record )
    assert.equal( logDta.code, 200 )
  })

  it( 'parse hex strange logs', () => {
    let record = {
      LogEntry: '66.240.205.34 - [66.240.205.34] - - [10/Nov/2020:08:51:55 +0000] \"H\\x00\\x00\\x00tj\\xA8\\x9E#D\\x98+\\xCA\\xF0\\xA7\\xBBl\\xC5\\x19\\xD7\\x8D\\xB6\\x18\\xEDJ\\x1En\\xC1\\xF9xu[l\\xF0E\\x1D-j\\xEC\\xD4xL\\xC9r\\xC9\\x15\\x10u\\xE0%\\x86Rtg\\x05fv\\x86]%\\xCC\\x80\\x0C\\xE8\\xCF\\xAE\\x00\\xB5\\xC0f\\xC8\\x8DD\\xC5\\x09\\xF4\" 400 157 \"-\" \"-\" 0 0.174 [] - - - - ccae4a996c58deae9dfab0c4d97d220d'
    }
    let logDta  = ehLog.checkAndParseAccessLog( record )
    assert.equal( logDta.code, 400 )
  })


})