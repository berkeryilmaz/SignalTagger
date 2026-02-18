from Oscilloscope.TrigItems import TrigItems
class Trig:
    def __init__(self, trig_dict):
        trig_dict = {key.lower(): trig_dict[key] for key in trig_dict}
        self.mode = trig_dict['mode']
        self.type = trig_dict['type']
        self.items = TrigItems(trig_dict['items'])
        self.sweep = trig_dict['sweep']

    @property
    def __dict__(self):
        return {
            'mode': self.mode,
            'type': self.type,
            'items': self.items.__dict__,
            'sweep': self.sweep
        }
