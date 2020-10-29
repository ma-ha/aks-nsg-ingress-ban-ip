const { EventHubClient, EventPosition } = require( '@azure/event-hubs' )
const log    = require( './log' ).logger

module.exports = {
  startEhStreamReceiver
}

// ----------------------------------------------------------------------------
// Configs

const logRegExp = /^(\S+) - \[(\S+)\] - - \[([\w:\/]+\s[+\-]\d{4})\] \"(\S+)\s?(\S+)?\s?(\S+)?\" (\d{3}|-) (\d+|-)\s?\"?([^\"]*)\"?\s?\"?([^\"]*)?" (\S+) (\S+) \[(\S+)\] (\S+) (\S+) (\S+)/g 

const ehNameSpace  = process.env.EH_NAMESPACE 
const ehKeyName    = process.env.EH_KEY_NAME
const ehKey        = process.env.EH_KEY
const ehName       = process.env.EH_NAME
const errThreshold = process.env.EH_NAME 

const ehConnStr = 'Endpoint=sb://'+ehNameSpace+'.servicebus.windows.net/;'+
                  'SharedAccessKeyName='+ehKeyName+';SharedAccessKey='+ehKey

// ----------------------------------------------------------------------------
// Data fields

let errorIPs = {}

let banIpFn = null
let status  = null

// ----------------------------------------------------------------------------
// Receive data after processing from Azure Event Hub

async function startEhStreamReceiver( statusReport, banIpCallback ) {
  status = statusReport
  try {

    log.info( 'EH: Start: '+ehNameSpace+'/'+ehName )
    const client = EventHubClient.createFromConnectionString( 
      ehConnStr, 
      ehName
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
      
      let logDta = checkAndParseAccessLog( record )
      
      // only access log with error codes:
      if ( logDta && logDta.code >= 400 ) { 
        log.info( 'access-error', logDta )
        status.errCnt++

        if ( errorIPs[ logDta.ip ] ) { // IP caused errors before

          errorIPs[ logDta.ip ]++
          if ( errorIPs[ logDta.ip ] > errThreshold ) {

            banIpCallback( logDta.ip )

          }

        } else { // add new IP to error list
          errorIPs[ logDta.ip ] = 1
        }
      }
    }
  } catch ( e ) {  log.error( 'EH receive', e ) }
}


// ----------------------------------------------------------------------------
// helper

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