# Video fixtures (VID-10)

Two 1-second test-pattern videos made with ffmpeg 6.1 (`testsrc` + a 440 Hz tone, 160×90), carrying a made-up location
(Tokyo, `+35.6895+139.6917`) and made-up make, model and date. No real person, place or phone. Remake them with:

```
ffmpeg -f lavfi -i testsrc=size=160x90:rate=10 -f lavfi -i sine=frequency=440:sample_rate=8000 -t 1 -c:v libx264 -preset ultrafast -crf 40 -c:a aac -b:a 16k \
  -metadata location="+35.6895+139.6917+040.000/" -metadata "location-eng=+35.6895+139.6917+040.000/" -metadata make=Apple -metadata model="iPhone 15 Pro" -metadata creation_time=2026-07-04T08:00:00Z \
  -metadata com.apple.quicktime.location.ISO6709="+35.6895+139.6917+040.000/" -movflags use_metadata_tags -timecode 01:00:00:00 iphone-like.mov
ffmpeg -f lavfi -i testsrc=size=160x90:rate=10 -f lavfi -i sine=frequency=440:sample_rate=8000 -t 1 -c:v libx264 -preset ultrafast -crf 40 -c:a aac -b:a 16k \
  -metadata location="+35.6895+139.6917/" -metadata creation_time=2026-07-04T08:00:00Z -movflags +faststart android-like.mp4
```

To check a cleaned copy by hand: `VID_OUT=/some/dir npx jest cleanVideo`, then `ffprobe -show_entries format_tags:stream_tags` and `ffmpeg -v error -i <file> -f null -` on the files written there.
