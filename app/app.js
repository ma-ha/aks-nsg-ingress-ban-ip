const nsg    = require( 'azure-nsg-ban-ips' )
const log    = require( './log' ).logger
const pjson  = require( './package.json' )
const ehLogs = require( './eh-logs' )
const stats  = require( './health' )

log.info( 'Starting '+pjson.name+' v'+pjson.version )

let cfg = readConfig()

let status = {
  msgCnt    : 0,
  errCnt    : 0,
  bannedIPs : {}
}

run()

// run NSG clean up every hour
setInterval( unbanIPs, 60 * 60 * 1000 ) 

// ----------------------------------------------------------------------------
let banning = false 
let banBacklog = []
let bannedIPs = []

async function run() {
  try {
    log.info( 'Login for NSG operations...' )
    log.info( 'Sub: '+cfg.nsgSubId +' RG:'+cfg.nsgRG +' NSG:'+cfg.nsgName )

    // get credentials for all following operations first:
    await nsg.login( cfg.spId, cfg.spKey, cfg.aadId, cfg.nsgSubId, cfg.nsgRG, cfg.nsgName )
    
    log.info( 'Clean up NSGs first...' )
    nsg.cleanupOldBlacklists()

    log.info( 'Start EventHub listener...' )
    ehLogs.init( status, cfg )
    ehLogs.startEhStreamReceiver( banIPaddrCallback )

    stats.initHealthEndpoint( cfg.healthzPath, status )

  } catch ( exc ) { 
    log.error( 'Exception in MAIN run()', exc ) 
    process.exit( 0 )
  }
}

// ----------------------------------------------------------------------------
// process banning in NSG

async function banIPaddrCallback( maliciousIPaddr ) {
  try {
    if ( bannedIPs && bannedIPs.indexOf( maliciousIPaddr ) >=0 ) {
      return
    }
    banBacklog.push( maliciousIPaddr )
    status.bannedIPs[ maliciousIPaddr ] = ( new Date() ).toISOString()

    // this should also handles DDoS attacks well
    if ( ! banning ) { // avoid running multiple NSG ops at the same time
      banning = true
      log.debug( 'Banning mode ON' )
      while ( banBacklog.length > 0 ) { 
        log.debug( 'banBacklog', banBacklog )
        let clonedBanList = JSON.parse( JSON.stringify( banBacklog ) ) 
        banBacklog = [] 
        try {
          log.debug( 'calling addIpAddrArrToBlacklist...' )
          bannedIPs = await nsg.addIpAddrArrToBlacklist( clonedBanList )
          log.debug( 'Blacklist', bannedIPs )
        } catch ( e ) { log.error( e ) }
      }
      banning = false
      log.debug( 'Banning mode OFF' )
    }

  } catch ( exc ) { 
    log.error( exc ) 
    banning = false
  }
}

// ----------------------------------------------------------------------------
// remove all ban rules older than 2 days
function unbanIPs() {
  nsg.cleanupOldBlacklists()
}

// ----------------------------------------------------------------------------
// helper

function readConfig() {
  let mustDie = false
  let configs = { 
    aadId        : 'AAD_ID', 
    spId         : 'SP_ID',
    spKey        : 'SP_KEY',
    nsgName      : 'NSG',
    nsgRG        : 'NSG_RG',
    nsgSubId     : 'NSG_SUB_ID',
    ehNameSpace  : 'EH_NS',
    ehName       : 'EH_NAME',
    ehKeyName    : 'EH_KEY_NAME',
    ehKey        : 'EH_KEY',
    errorsMax    : 'ERROR_THRESHOLD',
    nogoPatterns : 'NOGO_REQUESTS',
    nogoMax      : 'NOGO_THRESHOLD',
    healthzPath  : 'HEALTH_PATH'
  }
  for ( let aCfg in configs ) {
    let cfgVar = configs[ aCfg ]
    if ( process.env[ cfgVar ] ) {
      configs[ aCfg ] = process.env[ cfgVar ] 
    } else {
      console.log( 'ERROR: Environment variable '+cfgVar+' not set.' )
      mustDie = true
    }
  }
  if ( mustDie ) { 
    process.exit( 0 ) 
  }
  return configs
}