/* Bản tham chiếu Swiss Ephemeris cho MỘT thời điểm cụ thể (ví dụ kiểm chứng).
 * Dùng: ./one <jd_ut> <lat> <lon>   -> JSON gồm 28 điểm, 12 hệ nhà, 7 ayanamsa, góc bản đồ. */
#include <stdio.h>
#include <stdlib.h>
#include "swephexp.h"

static const int CODES[] = {0,1,2,3,4,5,6,7,8,9,10,11,12,21,15,17,18,19,20,40,41,42,43,44,45,46,47,48};
static const char *NAMES[] = {"sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto",
  "meanNode","trueNode","meanApog","intpApog","chiron","ceres","pallas","juno","vesta",
  "cupido","hades","zeus","kronos","apollon","admetos","vulkanus","poseidon","isisTranspluto"};
static const int NBODY = 28;
static const char *HSYS[] = {"P","W","A","D","O","K","C","R","B","T","M","S"};
static const char *HNAMES[] = {"placidus","wholeSign","equal","equalMC","porphyry","koch","campanus","regiomontanus","alcabitius","topocentric","morinus","sripati"};
static const int NH = 12;
static const int AMODES[] = {SE_SIDM_FAGAN_BRADLEY, SE_SIDM_LAHIRI, SE_SIDM_RAMAN, SE_SIDM_KRISHNAMURTI, SE_SIDM_DELUCE, SE_SIDM_GALCENT_0SAG};
static const char *ANAMES[] = {"faganBradley","lahiri","raman","krishnamurti","deLuce","galactic"};
static const int NA = 6;

int main(int argc, char **argv) {
  swe_set_ephe_path("/tmp/ephe");
  char serr[256];
  if (argc < 4) { fprintf(stderr, "usage: one <jd_ut> <lat> <lon>\n"); return 1; }
  double jd = atof(argv[1]);
  double lat = atof(argv[2]);
  double lon = atof(argv[3]);

  printf("{\n\"source\":\"Swiss Ephemeris 2.10 (tests/gen/example-ref.c)\",\n");
  printf("\"jd_ut\":%.6f,\n\"lat\":%.6f,\n\"lon\":%.6f,\n", jd, lat, lon);
  printf("\"deltat\":%.8f,\n", swe_deltat(jd));
  printf("\"bodies\":[\n");
  for (int i = 0; i < NBODY; i++) {
    double x[6];
    int r = swe_calc_ut(jd, CODES[i], SEFLG_SWIEPH | SEFLG_SPEED, x, serr);
    printf("  {\"name\":\"%s\",\"lon\":%.6f,\"lat\":%.6f,\"speed\":%.6f}%s\n", NAMES[i],
           (r < 0) ? 0.0 : x[0], (r < 0) ? 0.0 : x[1], (r < 0) ? 0.0 : x[3], i + 1 < NBODY ? "," : "");
  }
  printf("],\n\"houses\":[\n");
  for (int h = 0; h < NH; h++) {
    double cusps[13], ascmc[10];
    int r = swe_houses(jd, lat, lon, HSYS[h][0], cusps, ascmc);
    printf("  {\"id\":\"%s\",\"ok\":%d,\"asc\":%.6f,\"mc\":%.6f,\"armc\":%.6f,\"vertex\":%.6f,\"eastPoint\":%.6f,\"cusps\":[",
           HNAMES[h], r, ascmc[0], ascmc[1], ascmc[2], ascmc[3], ascmc[4]);
    for (int i = 1; i <= 12; i++) printf("%s%.6f", i > 1 ? "," : "", cusps[i]);
    printf("]}%s\n", h + 1 < NH ? "," : "");
  }
  printf("],\n\"ayanamsa\":{\n");
  for (int a = 0; a < NA; a++) {
    swe_set_sid_mode(AMODES[a], 0, 0);
    printf("  \"%s\":%.6f%s\n", ANAMES[a], swe_get_ayanamsa_ut(jd), a + 1 < NA ? "," : "");
  }
  printf("}\n}\n");
  return 0;
}
