#include <stdio.h>
#include "swephexp.h"

static const int CODES[] = {0,1,2,3,4,5,6,7,8,9,10,11,12,21,15,17,18,19,20,40,41,42,43,44,45,46,47,48,56};
static const char *NAMES[] = {"sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto",
  "meanNode","trueNode","meanApog","intpApog","chiron","ceres","pallas","juno","vesta",
  "cupido","hades","zeus","kronos","apollon","admetos","vulkanus","poseidon","isisTranspluto","selena"};
static const int NBODY = 29;

int main(int argc, char **argv) {
  swe_set_ephe_path("/tmp/ephe");
  char serr[256];
  int mode = (argc > 1) ? atoi(argv[1]) : 0;

  if (mode == 0) {
    /* (a) fixture geocentric: 41 mốc, cách nhau 5 năm */
    printf("{\"source\":\"Swiss Ephemeris 2.10 swe_calc_ut SEFLG_SWIEPH ecliptic of date (tests/gen/points-ref.c)\",\"obliquity\":23.4392911,\"records\":[");
    int first = 1;
    for (int year = 1900; year <= 2100; year += 5) {
      double jd = swe_julday(year, 1 + (year % 12), 1 + (year % 25), 6.0 + (year % 7), SE_GREG_CAL);
      printf("%s{\"jd\":%.5f,\"b\":[", first ? "" : ",", jd);
      for (int i = 0; i < NBODY; i++) {
        double x[6];
        int r = swe_calc_ut(jd, CODES[i], SEFLG_SWIEPH, x, serr);
        if (r < 0) printf("%snull", i ? "," : "");
        else printf("%s[%.4f,%.4f]", i ? "," : "", x[0], x[1]);
      }
      printf("]}");
      first = 0;
    }
    printf("],\"bodies\":[");
    for (int i = 0; i < NBODY; i++) printf("%s\"%s\"", i ? "," : "", NAMES[i]);
    printf("]}\n");
  } else {
    /* (b) dữ liệu fit phần tử: heliocentric J2000 ecliptic cho 5 tiểu hành tinh, mỗi 30 ngày 1850-2150 */
    int bodies[5] = {15, 17, 18, 19, 20};
    printf("{\"rows\":[");
    int first = 1;
    for (double jd = 2396758.5; jd <= 2506352.5; jd += 30.0) {
      printf("%s[%.1f", first ? "" : ",", jd);
      for (int i = 0; i < 5; i++) {
        double x[6];
        swe_calc_ut(jd, bodies[i], SEFLG_HELCTR | SEFLG_J2000 | SEFLG_NONUT, x, serr);
        printf(",%.6f,%.6f,%.9f", x[0], x[1], x[2]);
      }
      printf("]");
      first = 0;
    }
    printf("]}\n");
  }
  return 0;
}
