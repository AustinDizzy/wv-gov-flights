const DESTINATION_ORIGIN = "https://l.abs.codes";
const DESTINATION_BASE_PATH = "/wv-gov-flights";

export default {
  fetch(request) {
    const source = new URL(request.url);
    const destination = new URL(DESTINATION_ORIGIN);

    destination.pathname = `${DESTINATION_BASE_PATH}${source.pathname}`;
    destination.search = source.search;

    return Response.redirect(destination.toString(), 308);
  },
};
