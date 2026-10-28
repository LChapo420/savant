/* Body tracking for the camera tools: MediaPipe Pose Landmarker (Apache-2.0), lite
 * model, run in this browser on this device.
 *
 *   PolymathPose.load() -> Promise<{ detect(canvas, nowMs) -> [landmarks...], delegate, close() }>
 *
 * The library, its WebAssembly and the model are files on this site
 * (/vendor/mediapipe/, see NOTICE.txt there): nothing is fetched from anywhere
 * else, and no picture leaves the device. If the browser cannot run it (no
 * WebAssembly, a page policy that forbids it, an old phone), load() rejects and
 * the tools keep using motion, as before.
 *
 * Each detect() returns up to two bodies, each 33 landmarks { x, y, z, visibility }
 * with x and y as shares of the picture; tracking.js turns them into feet, wrists
 * and the release moment.
 */
(function (global) {
  var VENDOR = '/vendor/mediapipe/';
  var loading = null;

  function load() {
    if (loading) return loading;
    if (typeof WebAssembly === 'undefined') return Promise.reject(new Error('This browser cannot run body tracking.'));
    loading = import(VENDOR + 'vision_bundle.mjs').then(function (vision) {
      return vision.FilesetResolver.forVisionTasks(VENDOR + 'wasm').then(function (files) {
        var opts = function (delegate) {
          return { baseOptions: { modelAssetPath: VENDOR + 'pose_landmarker_lite.task', delegate: delegate }, runningMode: 'VIDEO', numPoses: 2, minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5 };
        };
        // The graphics chip where the browser allows it, else the processor.
        return vision.PoseLandmarker.createFromOptions(files, opts('GPU')).then(function (pl) { return { pl: pl, delegate: 'GPU' }; }, function () {
          return vision.PoseLandmarker.createFromOptions(files, opts('CPU')).then(function (pl) { return { pl: pl, delegate: 'CPU' }; });
        });
      });
    }).then(function (made) {
      var last = 0;
      return {
        delegate: made.delegate,
        detect: function (source, nowMs) {
          // Timestamps must rise for VIDEO mode.
          var t = Math.max(last + 1, Math.round(nowMs));
          last = t;
          var r = made.pl.detectForVideo(source, t);
          return (r && r.landmarks) || [];
        },
        close: function () { try { made.pl.close(); } catch (e) { last = 0; } loading = null; },
      };
    });
    loading.catch(function () { loading = null; });
    return loading;
  }

  global.PolymathPose = { load: load };
})(typeof window !== 'undefined' ? window : globalThis);
