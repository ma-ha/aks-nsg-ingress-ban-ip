const { EventHubClient, EventPosition } = require( '@azure/event-hubs' )
const log    = require( './log' ).logger

module.exports = {
  init,
  startEhStreamReceiver,
  checkAndParseAccessLog
}

let penaltyReduceJob = null

// ----------------------------------------------------------------------------
// Configs

let cfg    = null
let status = null

let max = {
  'nogo' : 50,
  'err' :  3
}
let nogoPatterns = []

let ehConnStr = null

// ----------------------------------------------------------------------------
// Data fields

let errorIPs = {}

let banIpFn = null

// ----------------------------------------------------------------------------
function init( statusDta, config ) {
  cfg    = config
  status = statusDta

  ehConnStr = 'Endpoint=sb://'+cfg.ehNameSpace+'.servicebus.windows.net/;'+
    'SharedAccessKeyName='+cfg.ehKeyName+';SharedAccessKey='+cfg.ehKey

  nogoPatterns = cfg.nogoPatterns.split(',')
  max[ 'nogo' ] = cfg.nogoMax
  max[ 'err' ] = cfg.errorsMax

  log.info( 'Error Thresholds ',max )
  log.info( 'NoGo Patterns',nogoPatterns )

  // reduce penalty count every minute
  penaltyReduceJob = setInterval( reducePenaltyCount, 60 * 1000 ) 
  errorIPs = status.errorIPs
}

// ----------------------------------------------------------------------------
function reducePenaltyCount() {
  for ( let ip in errorIPs ) {
    //log.debug( 'reducePenaltyCount', ip, errorIPs[ip]['nogo'] , errorIPs[ip]['err'] )
    if ( errorIPs[ip]['nogo'] > 0  ) {
      errorIPs[ip]['nogo']--
      log.debug( 'reduce nogo', ip, errorIPs[ip]['nogo'] )
    }
    if ( errorIPs[ip]['err'] > 0  ) {
      errorIPs[ip]['err']--
      log.debug( 'reduce err', ip, errorIPs[ip]['err'] )
    }
    if ( errorIPs[ip]['err'] == 0  && errorIPs[ip]['err'] == 0) {
      log.debug( 'del from list', ip  )
      delete errorIPs[ ip ]
    }
  }
}

// ----------------------------------------------------------------------------
// Receive data after processing from Azure Event Hub

async function startEhStreamReceiver( banIpCallback ) {
  try {

    log.info( 'EH: Start: '+cfg.ehNameSpace+'/'+cfg.ehName )
    const client = EventHubClient.createFromConnectionString( 
      ehConnStr, 
      cfg.ehName
    )

    log.info( 'EH: Get partitions...' )
    const allPartitionIds = await client.getPartitionIds()
    
    log.info( 'EH: Starting receivers...' )
    for ( let partition of allPartitionIds ) {
      log.info( 'EH: ... start receiver on partition '+partition )
      const rcvOpts =  { eventPosition: EventPosition.fromEnqueuedTime( Date.now() )  }
      receiveHandler = client.receive( partition, onMessage, onErr, rcvOpts )  
    }

    banIpFn = banIpCallback
    log.info( 'EH: Ready.' )

  } catch ( exc ) {
    log.error( exc )
    throw( exc )
  }
}

// ----------------------------------------------------------------------------

const onErr = ( error ) => {
  log.error( 'EH: Error when receiving message: ', error )
}

// ----------------------------------------------------------------------------

const onMessage = ( eventData ) => {
  try { 
    // eventhub delivers messages as bulk:
    for ( let record of extractLogArr( eventData ) ) {

      let needBan = false      
      let logDta  = checkAndParseAccessLog( record )
      
      // only access log with error codes:
      if ( isNogoPattern( logDta ) ) {
        needBan = addViolationForIP( logDta, 'nogo' )
      } else if ( isHttpError( logDta ) ) {
        needBan = addViolationForIP( logDta, 'err' )
      } 

      if ( needBan ) {
        log.info( 'Ban IP address: ' + logDta.ip )
        logDta.banTime = (new Date()).toISOString()
        banIpFn( logDta )
      }
    }
  } catch ( e ) {  log.error( 'EH receive', e ) }
}

// ----------------------------------------------------------------------------
// helper

function logLastEvents( record ) {
  if ( record.LogEntry ) {
    status.lastLog.push( record.LogEntry )
    if ( status.lastLog.length > 20 ) {
      status.lastLog.shift()
    }
  }
}

function addViolationForIP( logDta, reason ) {
  log.debug( reason, logDta )
  status.errCnt++
  if ( ! errorIPs[ logDta.ip ] ) {// IP caused no violations before
    errorIPs[ logDta.ip ] = {
        'nogo' : 0,
        'err' : 0
      }
  }
  errorIPs[ logDta.ip ][ reason ]++
  log.debug( 'check max', logDta.ip, errorIPs[ logDta.ip ][ reason ], max[ reason ] )
  if ( errorIPs[ logDta.ip ][ reason ] >= max[ reason ] ) {
    return true
  }
  return false
}

function isHttpError( logDta ) {
  if ( logDta && logDta.code >= 400 ) { 
    return true 
  }
  return false
}

function isNogoPattern( logDta ) {
  if ( ! logDta ) { return }
  for ( let nogo of nogoPatterns ) {
    if ( logDta.op.indexOf( nogo ) != -1 ) {
      log.info( 'NOGO!!', logDta.op, nogo )
      return true 
    } 
  }
  return false
}

function extractLogArr( eventData ) {
  if ( eventData.body && eventData.body.records ) {
    return eventData.body.records
  } else {
    return []
  }
}

function checkAndParseAccessLog( record ) {
  if ( record.LogEntry && record.LogEntry.indexOf('- - [') > 0 ) { 
    logLastEvents( record ) 

    let logSplitStr = record.LogEntry.split('"')

    let callStr  = logSplitStr[1]
    let callerIP = logSplitStr[0].split(' ')[0]
    let codeStr  = logSplitStr[2].trim().split(' ')[0]

    if ( status.tracelogs ) { 
      log.info( callerIP +' '+ callStr +' '+ codeStr )
    }

    let code = parseInt( codeStr, 10 )
    if ( isNaN( code ) ) { code = -1  }
    let result = {
      ip   : callerIP,
      op   : callStr,
      code : code
    }
    status.msgCnt++
    return result
  }
  return null
}