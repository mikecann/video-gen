export default {
  app: {
    name: "Video Gen",
    identifier: "com.mikerosoft.video-gen",
    version: "1.0.0",
  },
  build: {
    // This app uses Bun. Electrobun 2 otherwise defaults to Cottontail.
    mainProcess: "bun",
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    views: {
      "video-gen-ui": {
        entrypoint: "src/ui/index.tsx",
      },
    },
    copy: {
      "src/ui/index.html": "views/video-gen-ui/index.html",
    },
  },
};
