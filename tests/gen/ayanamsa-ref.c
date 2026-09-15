#include <stdio.h>
#include "swephexp.h"
int main(void) {
  int modes[6] = {SE_SIDM_FAGAN_BRADLEY, SE_SIDM_LAHIRI, SE_SIDM_RAMAN, SE_SIDM_KRISHNAMURTI, SE_SIDM_DELUCE, SE_SIDM_GALCENT_0SAG};
  const char *names[6] = {"faganBradley","lahiri","raman","krishnamurti","deLuce","galactic"};
  printf("{\n\"source\":\"Swiss Ephemeris 2.10 swe_get_ayanamsa_ut (tests/gen/ayanamsa-ref.c)\",\n\"series\":[");
  int first = 1;
  for (int m = 0; m < 6; m++) {
    for (int year = 1800; year <= 2100; year += 5) {
      double jd = swe_julday(year, 1, 1, 12.0, SE_GREG_CAL);
      swe_set_sid_mode(modes[m], 0, 0);
      double ayan = swe_get_ayanamsa_ut(jd);
      printf("%s{\"m\":\"%s\",\"jd\":%.1f,\"a\":%.6f}", first ? "" : ",", names[m], jd, ayan);
      first = 0;
    }
  }
  printf("]}\n");
  return 0;
}
