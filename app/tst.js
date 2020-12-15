const ehLogs = require( './eh-logs' )

let record = {
  LogEntry: '40.91.82.96 - - [26/Nov/2020:07:05:50 +0000] "GET /pc/version HTTP/1.1" 200 80 "-" "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; Trident/5.0; AppInsights)" 569 0.002 [dex-people-counter-80] [] 10.244.2.81:8080 80 0.004 200 182b53764cf21ec81d299365392b3c78'
}

ehLogs.checkAndParseAccessLog( record )