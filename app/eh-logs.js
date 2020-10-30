const { EventHubClient, EventPosition } = require( '@azure/event-hubs' )
const log    = require( './log' ).logger

module.exports = {
  init,
  startEhStreamReceiver
}

let penaltyReduceJob = null

// ----------------------------------------------------------------------------
// Configs

const logRegExp = /^(\S+) - \[(\S+)\] - - \[([\w:\/]+\s[+\-]\d{4})\] \"(\S+)\s?(\S+)?\s?(\S+)?\" (\d{3}|-) (\d+|-)\s?\"?([^\"]*)\"?\s?\"?([^\"]*)?" (\S+) (\S+) \[(\S+)\] (\S+) (\S+) (\S+)/g 

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
  status.errorIPs = errorIPs
}

// ----------------------------------------------------------------------------
function reducePenaltyCount() {
  for ( let ip in errorIPs ) {
    log.debug( 'reducePenaltyCount', ip, errorIPs[ip]['nogo'] , errorIPs[ip]['err'] )
    if ( errorIPs[ip]['nogo'] > 0  ) {
      errorIPs[ip]['nogo']--
      log.debug( 'reduce nogo', errorIPs[ip], errorIPs[ip]['nogo'] )
    }
    if ( errorIPs[ip]['err'] > 0  ) {
      errorIPs[ip]['err']--
      log.debug( 'reduce err', errorIPs[ip], errorIPs[ip]['err'] )
    }
    if ( errorIPs[ip]['err'] == 0  && errorIPs[ip]['err'] == 0) {
      log.debug( 'del from list', errorIPs[ ip ] )
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
      // ,{ initialOffset: EventPosition.fromEnqueuedTime( Date.now() ) }
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
        banIpFn( logDta.ip )
      }
    }
  } catch ( e ) {  log.error( 'EH receive', e ) }
}

// ----------------------------------------------------------------------------
// helper

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
  log.debug( 'check max', errorIPs[ logDta.ip ][ reason ], max[ reason ] )
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
      log.debug( 'NOGO!!', logDta.op, nogo )
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
  if ( record.LogEntry && record.LogEntry.indexOf('] - - [') > 0 ) {
    let arr = logRegExp.exec( record.LogEntry )
    if ( arr && arr.length > 1 ) {
      let code = parseInt( arr[7], 10 )
      if ( isNaN( code ) ) { code = -1  }
      let result = {
        ip   : arr[1],
        op   : arr[4]+' '+arr[5],
        agent: arr[10],
        code : code
      }
      status.msgCnt++
      return result
    } 
  }
  return null
}