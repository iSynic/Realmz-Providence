#include <stddef.h>
#include <stdio.h>

#include "realmz_orig/structs.h"

#define STRUCT(name) printf("struct\t%s\t%zu\n", #name, sizeof(struct name))
#define FIELD(name, member)                                                                       \
  printf("field\t%s\t%s\t%zu\t%zu\n", #name, #member, offsetof(struct name, member),             \
         sizeof(((struct name*)0)->member))

static void probe_restrictinfo(void) {
  STRUCT(restrictinfo);
  FIELD(restrictinfo, description);
  FIELD(restrictinfo, maxpc);
  FIELD(restrictinfo, maxlevel);
  FIELD(restrictinfo, canrace);
  FIELD(restrictinfo, cancaste);
}

static void probe_contactdata(void) {
  STRUCT(contactdata);
  FIELD(contactdata, scenarioname);
  FIELD(contactdata, version);
  FIELD(contactdata, date);
  FIELD(contactdata, authorsname);
  FIELD(contactdata, email);
  FIELD(contactdata, web);
  FIELD(contactdata, fee);
  FIELD(contactdata, payinfo);
  FIELD(contactdata, titles);
  FIELD(contactdata, description);
}

static void probe_door(void) {
  STRUCT(door);
  FIELD(door, doorid);
  FIELD(door, landid);
  FIELD(door, landx);
  FIELD(door, landy);
  FIELD(door, percent);
  FIELD(door, code);
  FIELD(door, id);
}

static void probe_race(void) {
  STRUCT(race);
  FIELD(race, plusminustohit);
  FIELD(race, specialability);
  FIELD(race, drvbonus);
  FIELD(race, attbonus);
  FIELD(race, minmax);
  FIELD(race, spare);
  FIELD(race, conditions);
  FIELD(race, maxage);
  FIELD(race, doesnotdie);
  FIELD(race, basemove);
  FIELD(race, magres);
  FIELD(race, twohand);
  FIELD(race, missile);
  FIELD(race, numofattacks);
  FIELD(race, cancaste);
  FIELD(race, agerange);
  FIELD(race, agechange);
  FIELD(race, canregenerate);
  FIELD(race, defaulticonset);
  FIELD(race, itemtypes);
  FIELD(race, descriptors);
  FIELD(race, spacer);
}

static void probe_mapstats(void) {
  STRUCT(mapstats);
  FIELD(mapstats, sound);
  FIELD(mapstats, time);
  FIELD(mapstats, solid);
  FIELD(mapstats, shore);
  FIELD(mapstats, needboad);
  FIELD(mapstats, ispath);
  FIELD(mapstats, los);
  FIELD(mapstats, flyfloat);
  FIELD(mapstats, forest);
  FIELD(mapstats, spare);
  FIELD(mapstats, build);
  FIELD(mapstats, clearlandid);
}

static void probe_caste(void) {
  STRUCT(caste);
  FIELD(caste, specialability);
  FIELD(caste, drvbonus);
  FIELD(caste, attbonus);
  FIELD(caste, spellcasters);
  FIELD(caste, minmax);
  FIELD(caste, conditions);
  FIELD(caste, canusemissile);
  FIELD(caste, getsmissilebonus);
  FIELD(caste, stamina);
  FIELD(caste, strength);
  FIELD(caste, dodge);
  FIELD(caste, tohit);
  FIELD(caste, missile);
  FIELD(caste, hand2hand);
  FIELD(caste, spare1);
  FIELD(caste, spare2);
  FIELD(caste, casteclass);
  FIELD(caste, minimumagegroup);
  FIELD(caste, movebonus);
  FIELD(caste, magres);
  FIELD(caste, twohand);
  FIELD(caste, maxstaminabonus);
  FIELD(caste, bonusattacks);
  FIELD(caste, maxattacks);
  FIELD(caste, victory);
  FIELD(caste, startmoney);
  FIELD(caste, startitems);
  FIELD(caste, attacks);
  FIELD(caste, itemtypes);
  FIELD(caste, defaulticon);
  FIELD(caste, maxspellsattacks);
  FIELD(caste, spellssofar);
  FIELD(caste, spacer);
}

static void probe_battle(void) {
  STRUCT(battle);
  FIELD(battle, battle);
  FIELD(battle, dist);
  FIELD(battle, messagebefore);
  FIELD(battle, messageafter);
  FIELD(battle, battlemacro);
}

static void probe_timeencounter(void) {
  STRUCT(timeencounter);
  FIELD(timeencounter, day);
  FIELD(timeencounter, increment);
  FIELD(timeencounter, percent);
  FIELD(timeencounter, door);
  FIELD(timeencounter, reclevel);
  FIELD(timeencounter, recrect);
  FIELD(timeencounter, recx);
  FIELD(timeencounter, recy);
  FIELD(timeencounter, recitem);
  FIELD(timeencounter, recquest);
  FIELD(timeencounter, stuff);
}

static void probe_monster(void) {
  STRUCT(monster);
  FIELD(monster, hd);
  FIELD(monster, bonus);
  FIELD(monster, dx);
  FIELD(monster, name);
  FIELD(monster, movementmax);
  FIELD(monster, ac);
  FIELD(monster, magres);
  FIELD(monster, dist);
  FIELD(monster, traiter);
  FIELD(monster, size);
  FIELD(monster, type);
  FIELD(monster, noofattacks);
  FIELD(monster, noofmagattacks);
  FIELD(monster, attacks);
  FIELD(monster, damplus);
  FIELD(monster, castpercent);
  FIELD(monster, runpercent);
  FIELD(monster, surrenderpercent);
  FIELD(monster, misslepercent);
  FIELD(monster, cansum);
  FIELD(monster, save);
  FIELD(monster, spellimmune);
  FIELD(monster, money);
  FIELD(monster, spells);
  FIELD(monster, items);
  FIELD(monster, weapon);
  FIELD(monster, iconid);
  FIELD(monster, spellpoints);
  FIELD(monster, exp);
  FIELD(monster, stamina);
  FIELD(monster, staminamax);
  FIELD(monster, underneath);
  FIELD(monster, target);
  FIELD(monster, guarding);
  FIELD(monster, notonmenu);
  FIELD(monster, beenattacked);
  FIELD(monster, movement);
  FIELD(monster, magtohit);
  FIELD(monster, condition);
  FIELD(monster, lr);
  FIELD(monster, up);
  FIELD(monster, attacknum);
  FIELD(monster, bonusattack);
  FIELD(monster, todoondeath);
  FIELD(monster, maxspellpoints);
  FIELD(monster, monname);
}

static void probe_maps(void) {
  STRUCT(maps);
  FIELD(maps, icon);
  FIELD(maps, startx);
  FIELD(maps, starty);
  FIELD(maps, level);
  FIELD(maps, pictid);
  FIELD(maps, iconsize);
  FIELD(maps, show);
  FIELD(maps, isdungeon);
  FIELD(maps, spare);
  FIELD(maps, rect);
  FIELD(maps, note);
}

static void probe_thief(void) {
  STRUCT(thief);
  FIELD(thief, type);
  FIELD(thief, modifer);
  FIELD(thief, codes);
  FIELD(thief, codef);
  FIELD(thief, texts);
  FIELD(thief, textf);
  FIELD(thief, sounds);
  FIELD(thief, soundf);
  FIELD(thief, spell);
  FIELD(thief, lowdamage);
  FIELD(thief, highdamage);
  FIELD(thief, tumblers);
  FIELD(thief, prompt);
  FIELD(thief, sound);
}

static void probe_randlevel(void) {
  STRUCT(randlevel);
  FIELD(randlevel, randrect);
  FIELD(randlevel, percent);
  FIELD(randlevel, battlerange);
  FIELD(randlevel, randdoor);
  FIELD(randlevel, randdoorpercent);
  FIELD(randlevel, landlook);
  FIELD(randlevel, isdark);
  FIELD(randlevel, uselos);
  FIELD(randlevel, only);
  FIELD(randlevel, option);
  FIELD(randlevel, sound);
  FIELD(randlevel, text);
}

static void probe_treasure(void) {
  STRUCT(treasure);
  FIELD(treasure, itemid);
  FIELD(treasure, exp);
  FIELD(treasure, gold);
  FIELD(treasure, gems);
  FIELD(treasure, jewelry);
}

static void probe_encount2(void) {
  STRUCT(encount2);
  FIELD(encount2, code);
  FIELD(encount2, id);
  FIELD(encount2, choiceresult);
  FIELD(encount2, wordresult);
  FIELD(encount2, group);
  FIELD(encount2, spellid);
  FIELD(encount2, spellresult);
  FIELD(encount2, itemid);
  FIELD(encount2, itemresult);
  FIELD(encount2, canbackout);
  FIELD(encount2, thief);
  FIELD(encount2, maxtimes);
  FIELD(encount2, castesuccess);
  FIELD(encount2, thiefsuccess);
  FIELD(encount2, thieffail);
  FIELD(encount2, prompt);
}

static void probe_encount(void) {
  STRUCT(encount);
  FIELD(encount, code);
  FIELD(encount, id);
  FIELD(encount, choiceresult);
  FIELD(encount, canbackout);
  FIELD(encount, maxtimes);
  FIELD(encount, castesuccess);
  FIELD(encount, prompt);
}

static void probe_spell(void) {
  STRUCT(spell);
  FIELD(spell, range1);
  FIELD(spell, range2);
  FIELD(spell, queicon);
  FIELD(spell, tohitbonus);
  FIELD(spell, savebonus);
  FIELD(spell, fixedtargetnum);
  FIELD(spell, canrotate);
  FIELD(spell, saveadjust);
  FIELD(spell, cannot);
  FIELD(spell, resistadjust);
  FIELD(spell, cost);
  FIELD(spell, damage1);
  FIELD(spell, damage2);
  FIELD(spell, powerdam1);
  FIELD(spell, powerdam2);
  FIELD(spell, duration1);
  FIELD(spell, duration2);
  FIELD(spell, powerdur1);
  FIELD(spell, powerdur2);
  FIELD(spell, spelllook1);
  FIELD(spell, spelllook2);
  FIELD(spell, sound1);
  FIELD(spell, sound2);
  FIELD(spell, targettype);
  FIELD(spell, size);
  FIELD(spell, special);
  FIELD(spell, damagetype);
  FIELD(spell, spellclass);
  FIELD(spell, incombat);
  FIELD(spell, incamp);
}

static void probe_itemattr(void) {
  STRUCT(itemattr);
  FIELD(itemattr, st);
  FIELD(itemattr, itemid);
  FIELD(itemattr, iconid);
  FIELD(itemattr, type);
  FIELD(itemattr, blunt);
  FIELD(itemattr, nohands);
  FIELD(itemattr, lu);
  FIELD(itemattr, movement);
  FIELD(itemattr, ac);
  FIELD(itemattr, magres);
  FIELD(itemattr, damage);
  FIELD(itemattr, spellpoints);
  FIELD(itemattr, sound);
  FIELD(itemattr, wieght);
  FIELD(itemattr, cost);
  FIELD(itemattr, charge);
  FIELD(itemattr, iscurse);
  FIELD(itemattr, ismagical);
  FIELD(itemattr, itemcat);
  FIELD(itemattr, racerestrictions);
  FIELD(itemattr, casterestrictions);
  FIELD(itemattr, specificrace);
  FIELD(itemattr, specificcaste);
  FIELD(itemattr, raceclassonly);
  FIELD(itemattr, casteclassonly);
  FIELD(itemattr, spare2);
  FIELD(itemattr, vssmall);
  FIELD(itemattr, vslarge);
  FIELD(itemattr, heat);
  FIELD(itemattr, cold);
  FIELD(itemattr, electric);
  FIELD(itemattr, vsundead);
  FIELD(itemattr, vsdd);
  FIELD(itemattr, vsevil);
  FIELD(itemattr, sp1);
  FIELD(itemattr, sp2);
  FIELD(itemattr, sp3);
  FIELD(itemattr, sp4);
  FIELD(itemattr, sp5);
  FIELD(itemattr, xcharge);
  FIELD(itemattr, drop);
}

static void probe_shop(void) {
  STRUCT(shop);
  FIELD(shop, id);
  FIELD(shop, num);
  FIELD(shop, inflation);
}

int main(void) {
  probe_restrictinfo();
  probe_contactdata();
  probe_door();
  probe_race();
  probe_mapstats();
  probe_caste();
  probe_battle();
  probe_timeencounter();
  probe_monster();
  probe_maps();
  probe_thief();
  probe_randlevel();
  probe_treasure();
  probe_encount2();
  probe_encount();
  probe_spell();
  probe_itemattr();
  probe_shop();
  return 0;
}
