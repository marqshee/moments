const AWS = require("aws-sdk");
const child = require("child_process");
const file = require("fs");
const m3u8Parser = require("m3u8-parser");
const s3 = new AWS.S3({ region: "us-west-1" });

/**
 * AWS Lambda service:
 *  - processes m3u8 file based on quality
 *  - creates a new mp4 file based on the start and end times using ffmpeg
 *  - uploads the moment to a S3 bucket named moments
 * @param {object} event
 * @returns {object}
 */
exports.handler = async (event) => {
  try {
    const endTime = event.end_time;
    const s3Bucket = event.s3_bucket;
    const s3KeyFullPrefix = `${event.s3_key_prefix}/hls/${event.resolution}`;
    const startTime = event.start_time;
    const s3MomentBucket = "moments";

    // Retrieves HLS m3u8 playlist based on quality
    const params = {
      Bucket: s3Bucket,
      Key: `${s3KeyFullPrefix}/playlist.m3u8`,
    };
    const res = await s3.getObject(params).promise();
    const playlist = res.Body.toString("utf-8");
    const segments = playlistMomentParser(playlist, startTime, endTime);

    let files = await getMomentFilesFromS3(segments, s3Bucket, s3KeyFullPrefix);
    let inputs = files.join("|");
    let duration = endTime - startTime;
    child.execSync(
      `ffmpeg -i "concat:${inputs}" -ss ${segments.startOffset} -t ${duration} -acodec copy -vcodec copy /tmp/moment.mp4`
    );

    const mp4 = file.readFileSync("/tmp/moment.mp4");
    var date = new Date().toISOString();
    const putParams = {
      Bucket: s3MomentBucket,
      Key: `${s3KeyFullPrefix}/moment-${date}.mp4`,
      Body: mp4,
    };

    await s3.putObject(putParams).promise();

    child.execSync("rm /tmp/*.ts; rm /tmp/stitch.txt; rm /tmp/moment.mp4");

    const response = {
      statusCode: 200,
      body: "Moment Created!",
    };
    return response;
  } catch (err) {
    const response = {
      statusCode: err.statusCode,
      body: err.message,
    };
    throw new Error(JSON.stringify(response));
  }
};

/**
 * Parses m3u8 playlist for ts files within  given start and end time ranges and
 * calculates start and end time offsets.
 *
 * @param {string} playlist
 * @param {number} startTime
 * @param {number} endTime
 *
 * @returns {object}
 */
function playlistMomentParser(playlist, startTime, endTime) {
  const parser = new m3u8Parser.Parser();
  let duration = 0;
  let hasMomentStarted = false;
  let files = [];
  let startOffset = null;

  parser.push(playlist);
  parser.end();
  const segments = parser.manifest.segments;

  for (let segment of segments) {
    duration += segment.duration;

    if (duration > startTime && !hasMomentStarted) {
      startOffset = startTime - (duration - segment.duration);
      hasMomentStarted = true;
    }

    if (hasMomentStarted) {
      files.push(segment.uri);
    }

    if (duration > endTime) {
      break;
    }
  }
  return { files, startOffset };
}

/**
 * Retrieves files from S3 and saves them to /tmp.
 * @param {array} segments 
 * @param {string} s3Bucket 
 * @param {string} s3KeyFullPrefix 
 * 
 * @returns {object}
 */
function getMomentFilesFromS3(segments, s3Bucket, s3KeyFullPrefix) {
  var promises = [];

  for (let tsFile of segments.files) {
    promises.push(
      new Promise((resolve, reject) => {
        let destination = `/tmp/${tsFile}`;
        let fileStream = file.createWriteStream(destination);
        const params = {
          Bucket: s3Bucket,
          Key: `${s3KeyFullPrefix}/${tsFile}`,
        };

        let s3Stream = s3.getObject(params).createReadStream();
        s3Stream.on("error", reject);
        fileStream.on("error", reject);
        fileStream.on("finish", () => {
          resolve(destination);
        });
        s3Stream.pipe(fileStream);
      })
    );
  }

  return Promise.all(promises);
}
