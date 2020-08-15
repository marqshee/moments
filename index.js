const ffmpeg = require('ffmpeg-cli');
const AWS = require('aws-sdk');
const s3 = new AWS.S3({region: 'us-west-1'});
const m3u8Parser = require('m3u8-parser');
const file = require('fs');
const child = require('child_process');

const event = {
  id: '081957680644',
  s3_bucket: 'newness-takehome-livestream',
  s3_key_prefix: '081957680644/W2qj91sl5VDK/2020-08-03T16-21-25.146Z/EyEKX6dRDP81',
  resolution: '720p60',
  start_time: 60,
  end_time: 120
}

const start = async (event) => {
    const s3Bucket = event.s3_bucket;
    const s3KeyFullPrefix = `${event.s3_key_prefix}/hls/${event.resolution}`;
    const resolution = event.resolution;
    const startTime = event.start_time;
    const endTime = event.end_time;

    const s3MomentBucket = 'newness-takehome-moments';
    const params = {Bucket: s3Bucket, Key: `${s3KeyFullPrefix}/playlist.m3u8`};
    const response = await s3.getObject(params).promise();
    const playlist = response.Body.toString('utf-8');
    const momentTimeRange = playlistMomentParser(playlist, startTime, endTime);
    
    getMomentTsFilesFromS3(momentTimeRange, s3Bucket, s3KeyFullPrefix).then(() => {
        let command = "cat *.ts >stitch.txt";
        child.execSync(command);
        ffmpeg.runSync('-i stitch.txt -acodec copy -vcodec copy moment.mp4');
        
        const mp4 = file.readFileSync('moment.mp4');
        const date = new Date().toISOString();
        const putParams = {
          Bucket: s3MomentBucket,
          Key: `${s3KeyFullPrefix}/moment-${date}.mp4`,
          Body: mp4,
        }

        s3.putObject(putParams, (err, data) => {
          if (err) {
            console.err(err, err.stack);
          }
            console.log('done uploading');
        });
        child.execSync('rm *.ts; rm stitch.txt; rm moment.mp4');
    });
};
start(event);

function playlistMomentParser(playlist, startTtime, endTime) {
  const parser = new m3u8Parser.Parser();
  let tsCount = 0;
  let duration = 0;
  let hasMomentStarted = false;
  let hasMomentEnded = false;
  let momentStartingTs = null;
  let momentEndingTs = null;

  parser.addParser({
    expression: /#EXTINF/,
    customType: 'duration',
    dataParser: function(line) {
       duration = duration + parseFloat(line.split(':')[1]);
       if (duration > startTtime && !hasMomentStarted) {
         momentStartingTs = tsCount;
         hasMomentStarted = true;
       }
       if (duration > endTime && !hasMomentEnded) {
        momentEndingTs = tsCount;
        hasMomentEnded = true;
       }
       tsCount++;
       return {momentStartingTs, momentEndingTs};
    }
  });
  parser.push(playlist);
  parser.end();

  return parser.manifest.custom.duration;
}

function getMomentTsFilesFromS3(tsTimeRange, s3Bucket, s3KeyFullPrefix) {
  return new Promise((resolve, reject) => {
    for (let index = tsTimeRange.momentStartingTs; index <= tsTimeRange.momentEndingTs; index++) {
      const fileStream = file.createWriteStream(`./${index}.ts`);
      const params = {Bucket: s3Bucket, Key: `${s3KeyFullPrefix}/${index}.ts`};
  
      const s3Stream = s3.getObject(params).createReadStream();
      s3Stream.on('error', reject);
      fileStream.on('error', reject);
      fileStream.on('close', () => { resolve(`./${index}.ts`);});
      s3Stream.pipe(fileStream);
    }
  });
}



