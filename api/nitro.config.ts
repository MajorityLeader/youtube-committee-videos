//https://nitro.unjs.io/config
export default defineNitroConfig({
  srcDir: "server",
  devServer: {
    watch: ['.env']
  }
});
